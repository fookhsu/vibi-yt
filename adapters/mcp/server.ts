import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  executeYoutubeTool,
  findYoutubeTool,
  toJsonSchema,
  youtubeTools,
} from "../../tools/index.ts";
import type { AnyYoutubeToolSpec } from "../../tools/types.ts";

/**
 * Minimal Model Context Protocol server over the agent-neutral tool core.
 *
 * This file implements the protocol only; it does not touch stdin/stdout. The
 * stdio transport lives in `stdio.ts`, and tests drive `handleMessage()` directly.
 * Keeping the protocol dependency-free means any MCP client (Claude Code,
 * Cursor, Codex, ...) can use this package without pulling an SDK.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;
export const SERVER_NAME = "vibi";

export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: JsonRpcError;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServer {
  /** Server metadata for `initialize`. */
  readonly serverInfo: { name: string; version: string };
  /** MCP `tools/list` payload. */
  listTools(): McpToolDefinition[];
  /** Handle one JSON-RPC message. Returns `null` for notifications. */
  handleMessage(message: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null>;
}

export interface McpServerOptions {
  tools?: AnyYoutubeToolSpec[];
  name?: string;
  version?: string;
  /** Override the dispatcher (used by tests). */
  executeTool?: typeof executeYoutubeTool;
}

/**
 * Read this package's version.
 *
 * The source module lives at `adapters/mcp/server.ts` and the compiled one at
 * `dist/adapters/mcp/server.js`, so no fixed `../..` depth is correct for both.
 * Walk up until a `package.json` declares a version.
 */
function readPackageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { version?: unknown };
        if (typeof pkg.version === "string" && pkg.version.length > 0) return pkg.version;
      } catch {
        // Malformed package.json: keep walking.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return "0.0.0";
    dir = parent;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function success(id: string | number | null, result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: "2.0", id, result };
}

function failure(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcErrorResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

function pickProtocolVersion(requested: unknown): string {
  if (typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) {
    return requested;
  }
  return MCP_PROTOCOL_VERSION;
}

export function createMcpServer(options: McpServerOptions = {}): McpServer {
  const tools = options.tools ?? youtubeTools;
  const executeTool = options.executeTool ?? executeYoutubeTool;
  const serverInfo = {
    name: options.name ?? SERVER_NAME,
    version: options.version ?? readPackageVersion(),
  };

  function listTools(): McpToolDefinition[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toJsonSchema(tool.parameters),
    }));
  }

  async function callTool(params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const name = params.name;
    if (typeof name !== "string" || name.length === 0) {
      return failure(null, JSON_RPC_ERRORS.invalidParams, "tools/call requires a string 'name'");
    }

    if (!findYoutubeTool(name)) {
      return failure(null, JSON_RPC_ERRORS.invalidParams, `Unknown tool: ${name}`);
    }

    const args = isObject(params.arguments) ? params.arguments : {};
    const outcome = await executeTool(name, args);
    const result: Record<string, unknown> = {
      content: [{ type: "text", text: outcome.text }],
    };
    if (outcome.isError) result.isError = true;
    if (outcome.data && Object.keys(outcome.data).length > 0) {
      result.structuredContent = outcome.data;
    }
    return success(null, result);
  }

  async function dispatch(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = request.id ?? null;
    const hasId = request.id !== undefined && request.id !== null;
    const method = request.method;

    switch (method) {
      case "initialize": {
        const params = isObject(request.params) ? request.params : {};
        return success(id, {
          protocolVersion: pickProtocolVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo,
          instructions:
            "YouTube search, video metadata, and transcripts. Set YOUTUBE_API_KEY before starting the server, or reuse a key stored by the pi adapter.",
        });
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return hasId ? success(id, {}) : null;
      case "tools/list":
        return success(id, { tools: listTools() });
      case "tools/call": {
        const params = isObject(request.params) ? request.params : {};
        const response = await callTool(params);
        return { ...response, id };
      }
      default:
        if (!hasId) return null;
        return failure(id, JSON_RPC_ERRORS.methodNotFound, `Method not found: ${String(method)}`);
    }
  }

  async function handleMessage(message: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
    if (Array.isArray(message)) {
      if (message.length === 0) {
        return failure(null, JSON_RPC_ERRORS.invalidRequest, "Empty JSON-RPC batch");
      }
      const responses = await Promise.all(message.map((entry) => handleOne(entry)));
      const filtered = responses.filter((entry): entry is JsonRpcResponse => entry !== null);
      return filtered.length === 0 ? null : filtered;
    }
    return handleOne(message);
  }

  async function handleOne(message: unknown): Promise<JsonRpcResponse | null> {
    if (!isObject(message)) {
      return failure(null, JSON_RPC_ERRORS.invalidRequest, "Invalid JSON-RPC request");
    }

    const request = message as JsonRpcRequest;
    if (typeof request.method !== "string" || request.method.length === 0) {
      const id = request.id ?? null;
      return failure(id, JSON_RPC_ERRORS.invalidRequest, "Missing JSON-RPC method");
    }

    try {
      return await dispatch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure(request.id ?? null, JSON_RPC_ERRORS.internalError, message);
    }
  }

  return { serverInfo, listTools, handleMessage };
}
