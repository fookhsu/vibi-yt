import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { authStatusText, clearStoredApiKey, saveStoredApiKey } from "../../lib/config.ts";
import { registerYoutubeTools } from "./tools.ts";

/**
 * Pi extension entrypoint.
 *
 * The tool implementations live in `tools/` (agent-neutral) and the slash
 * commands stay here because `ctx.ui` is pi-specific. Other agents use the MCP
 * or portable-JSON adapters instead of this file.
 *
 * Commands are grouped under the `youtube:key` namespace. The bare command is
 * the read-only status check; mutations require an explicit verb.
 */
export default function (pi: ExtensionAPI) {
  registerYoutubeTools(pi);

  pi.registerCommand("youtube:key", {
    description: "Show YouTube API key configuration status without exposing secrets",
    handler: async (_args, ctx) => {
      const text = authStatusText();
      const configured = !text.includes("missing");
      ctx.ui.notify(text, configured ? "info" : "warning");
    },
  });

  pi.registerCommand("youtube:key:set", {
    description: "Enter and store a YouTube Data API key via Pi UI",
    handler: async (_args, ctx) => {
      const entered = await ctx.ui.input("YouTube Data API key:", "paste API key here");
      const apiKey = String(entered ?? "").trim();
      if (!apiKey) {
        ctx.ui.notify("API key was not saved.", "warning");
        return;
      }

      saveStoredApiKey(apiKey);
      ctx.ui.notify(
        "Saved YouTube API key for vibi. The key was handled by the extension UI and not sent to the model.",
        "info",
      );
    },
  });

  pi.registerCommand("youtube:key:clear", {
    description: "Remove the stored YouTube API key from the vibi auth file",
    handler: async (_args, ctx) => {
      clearStoredApiKey();
      ctx.ui.notify(
        "Removed stored vibi API key. YOUTUBE_API_KEY environment variable is unchanged.",
        "info",
      );
    },
  });
}
