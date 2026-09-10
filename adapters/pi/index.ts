/**
 * Pi adapter.
 *
 * This is a thin translation layer: it projects the core tool registry onto
 * `pi.registerTool()` and the five actions onto `/youtube:*` commands. It does
 * not format API responses, touch credentials, or classify failures — those
 * belong to core (ADR 0002).
 */

import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

import { vibiActions } from "../../lib/actions.ts";
import { closeActiveLoopback } from "../../lib/oauth-flow.ts";
import { youtubeTools } from "../../tools/index.ts";
import type { Action, ActionContext } from "../../tools/types.ts";
import { renderResultText } from "./render.ts";

function labelFor(toolName: string): string {
  const short = toolName.replace(/^youtube_/, "").replace(/_/g, " ");
  return `YouTube ${short.charAt(0).toUpperCase()}${short.slice(1)}`;
}

function artifactsDirFor(cwd: string): string {
  // The host owns its directory convention; core is only told the path.
  return path.join(cwd, ".pi", "tmp", "vibi-artifacts");
}

function commandContext(ctx: ExtensionCommandContext): ActionContext {
  const context: ActionContext = { agentDir: getAgentDir() };
  if (ctx.hasUI) {
    context.onUrl = (url) => ctx.ui.notify(url, "info");
    context.prompt = (question) => ctx.ui.input(question);
  }
  return context;
}

function registerActionCommand(pi: ExtensionAPI, action: Action): void {
  pi.registerCommand(`youtube:${action.name}`, {
    description: action.description,
    handler: async (_args, ctx) => {
      if (action.name === "deauthorize" && ctx.hasUI) {
        const confirmed = await ctx.ui.confirm(
          "Deauthorize vibi-yt?",
          "This revokes the YouTube authorization at Google and deletes the local token.",
        );
        if (!confirmed) {
          ctx.ui.notify("Deauthorization cancelled.", "info");
          return;
        }
      }

      const result = await action.run(commandContext(ctx));
      if (ctx.hasUI) {
        ctx.ui.notify(result.text, result.ok ? "info" : "error");
      }
    },
  });
}

export default function vibi(pi: ExtensionAPI): void {
  for (const tool of youtubeTools) {
    pi.registerTool({
      name: tool.name,
      label: labelFor(tool.name),
      description: tool.description,
      promptSnippet: tool.promptSnippet,
      promptGuidelines: tool.promptGuidelines,
      parameters: tool.parameters,
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        const result = await tool.execute(params as never, {
          agentDir: getAgentDir(),
          artifactsDir: artifactsDirFor(ctx.cwd),
          signal,
        });
        return {
          content: [{ type: "text" as const, text: renderResultText(result) }],
          details: result,
        };
      },
    });
  }

  for (const action of vibiActions) {
    registerActionCommand(pi, action);
  }

  // A loopback listener may be waiting when the session is replaced or quit.
  pi.on("session_shutdown", async () => {
    closeActiveLoopback();
  });
}
