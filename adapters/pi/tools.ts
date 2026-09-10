import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { youtubeTools } from "../../tools/index.ts";
import type { ToolContext } from "../../tools/types.ts";

/**
 * Pi adapter: project the agent-neutral tool specs onto `pi.registerTool()`.
 *
 * Error outcomes stay in the tool `content` (so the model can read the failure
 * and adapt) instead of throwing. Pi calls the structured part `details`, so the
 * neutral `ToolOutcome.data` field is mapped onto it unchanged.
 */
export function registerYoutubeTools(pi: ExtensionAPI) {
  for (const tool of youtubeTools) {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      promptSnippet: tool.promptSnippet,
      promptGuidelines: tool.promptGuidelines,
      parameters: tool.parameters,
      async execute(_toolCallId, params, signal) {
        const outcome = await tool.execute(
          params as Record<string, unknown>,
          { signal } satisfies ToolContext,
        );
        return {
          content: [{ type: "text" as const, text: outcome.text }],
          details: outcome.data ?? {},
        };
      },
    });
  }
}
