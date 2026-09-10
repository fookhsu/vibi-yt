import { toJsonSchema, youtubeTools } from "../tools/index.ts";
import type { AnyYoutubeToolSpec } from "../tools/types.ts";

/**
 * Portable tool-definition export.
 *
 * Use this for agents that accept JSON tool definitions rather than MCP:
 * OpenAI-compatible function calling, Anthropic Messages, or any custom loop.
 * Execution goes through `executeYoutubeTool` from `tools/index.ts`.
 */

export interface PortableToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenAiFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export function toToolDefinitions(tools: AnyYoutubeToolSpec[] = youtubeTools): PortableToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toJsonSchema(tool.parameters),
  }));
}

export function toOpenAiTools(tools: AnyYoutubeToolSpec[] = youtubeTools): OpenAiFunctionTool[] {
  return toToolDefinitions(tools).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toAnthropicTools(tools: AnyYoutubeToolSpec[] = youtubeTools): AnthropicToolDefinition[] {
  return toToolDefinitions(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

export { executeYoutubeTool } from "../tools/index.ts";
