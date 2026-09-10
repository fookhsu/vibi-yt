import { JSON_RPC_ERRORS, type JsonRpcResponse, type McpServer } from "./server.ts";

/**
 * Newline-delimited JSON-RPC transport for MCP stdio.
 *
 * Kept separate from `server.ts` so the protocol logic is testable without
 * spawning a process. Messages are handled strictly in order.
 */

export interface StdioInput {
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>;
}

export interface StdioOutput {
  write(chunk: string): unknown;
}

export interface StdioServerIo {
  input?: StdioInput;
  output?: StdioOutput;
}

function toLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export async function handleStdioLine(
  server: McpServer,
  line: string,
  output: StdioOutput,
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message: unknown;
  try {
    message = JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: null,
      error: { code: JSON_RPC_ERRORS.parseError, message: `Parse error: ${detail}` },
    };
    output.write(toLine(response));
    return;
  }

  const response = await server.handleMessage(message);
  if (response === null) return;
  output.write(toLine(response));
}

export async function runStdioServer(server: McpServer, io: StdioServerIo = {}): Promise<void> {
  const input = io.input ?? (process.stdin as unknown as StdioInput);
  const output = io.output ?? (process.stdout as unknown as StdioOutput);
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of input) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      await handleStdioLine(server, line, output);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    await handleStdioLine(server, buffer, output);
  }
}
