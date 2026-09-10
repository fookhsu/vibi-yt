export type {
  AnyYoutubeToolSpec,
  ToolContext,
  ToolOutcome,
  ToolTextContent,
  YoutubeToolSpec,
} from "./types.ts";

export {
  youtubeSearchTool,
  youtubeVideoDetailsTool,
  youtubeTranscriptTool,
  youtubeTools,
} from "./youtube-tools.ts";

export type {
  YoutubeSearchInput,
  YoutubeTranscriptInput,
  YoutubeVideoDetailsInput,
} from "./youtube-tools.ts";

import { formatToolError } from "../lib/formatters.ts";
import { youtubeTools } from "./youtube-tools.ts";
import type { AnyYoutubeToolSpec, ToolContext, ToolOutcome } from "./types.ts";

/** Look up a tool by its public name. */
export function findYoutubeTool(name: string): AnyYoutubeToolSpec | undefined {
  return youtubeTools.find((tool) => tool.name === name);
}

/**
 * Dispatch a tool by name using the agent-neutral contract.
 *
 * Unknown tools and thrown errors become `isError` outcomes so every adapter
 * (pi, MCP, portable JSON) can share one error path.
 */
export async function executeYoutubeTool(
  name: string,
  input: unknown,
  context?: ToolContext,
): Promise<ToolOutcome> {
  const tool = findYoutubeTool(name);
  if (!tool) {
    const message = `Unknown YouTube tool: ${name}`;
    return { text: message, data: { error: "unknown_tool", name }, isError: true };
  }

  const args = (input ?? {}) as Record<string, unknown>;
  try {
    return await tool.execute(args, context);
  } catch (error) {
    const message = formatToolError(error);
    return { text: message, data: { error: message }, isError: true };
  }
}

/**
 * JSON-Schema-safe copy of a tool's parameters.
 *
 * TypeBox schemas carry a non-enumerable symbol marker; a JSON round-trip drops
 * it so the result can be sent verbatim over MCP or an HTTP function-calling API.
 */
export function toJsonSchema(schema: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
}
