import { Type, type Static } from "typebox";

import { resolveApiKeyAuth } from "../lib/auth-session.ts";
import { deliverContent, mergeFields } from "../lib/present.ts";
import { getVideoDetails, type VideoDetails } from "../lib/youtube-api.ts";
import { asStringArray, failureFields, joinPreviews } from "./shared.ts";
import type { Detail, Tool, ToolResult } from "./types.ts";

export const videoDetailsInputSchema = Type.Object({
  videoIds: Type.Array(Type.String({ description: "A YouTube video ID." }), {
    minItems: 1,
    maxItems: 10,
    description: "One to ten video IDs. A single video is still written as an array.",
  }),
  detail: Type.Optional(
    Type.Union([Type.Literal("compact"), Type.Literal("full")], {
      default: "compact",
      description:
        "compact (default) returns metadata, statistics and a description preview; full returns the complete description.",
    }),
  ),
});

export type VideoDetailsInput = Static<typeof videoDetailsInputSchema>;

export interface VideoDetailsData {
  videos: Record<string, VideoDetails | null>;
}

const DESCRIPTION =
  "Get metadata and statistics for one to ten YouTube videos. `detail` controls the description: compact (default) gives metadata, statistics and a preview window of the description; full gives the whole description. Content over 8,000 characters is written to a JSONL file and you receive a preview plus its path — read that file when you need everything. A `truncated: true` field means you did not receive the whole content. Videos that do not exist are reported as null.";

export const youtubeVideoDetails: Tool<VideoDetailsInput, VideoDetailsData> = {
  name: "youtube_video_details",
  description: DESCRIPTION,
  promptSnippet: "Get metadata and statistics for one or more YouTube videos",
  promptGuidelines: [
    "Use youtube_video_details when the user asks about a specific video's title, channel, duration, publish date, views, likes, or description.",
  ],
  parameters: videoDetailsInputSchema,

  async execute(input, context): Promise<ToolResult<VideoDetailsData>> {
    const ids = asStringArray(input.videoIds).slice(0, 10);
    if (ids.length === 0) {
      return {
        ok: false,
        error: { code: "invalid_input", hint: "Provide 1 to 10 video IDs.", retryable: false },
        fields: failureFields(),
      };
    }

    const auth = resolveApiKeyAuth({
      agentDir: context.agentDir,
      env: process.env,
      fetchFn: context.fetchFn,
      signal: context.signal,
    });
    if (!auth.ok) return { ok: false, error: auth.error, fields: failureFields() };

    const result = await getVideoDetails(ids, {
      auth: auth.auth,
      fetchFn: context.fetchFn,
      signal: context.signal,
    });
    if (!result.ok) return { ok: false, error: result.error, fields: failureFields() };

    const detail: Detail = input.detail ?? "compact";
    const videos: Record<string, VideoDetails | null> = {};
    const fieldsList = [];
    const previews: Array<{ videoId: string; text: string }> = [];

    for (const id of ids) {
      const item = result.data[id] ?? null;
      if (!item) {
        videos[id] = null;
        continue;
      }

      const fullText = item.description ?? "";
      const delivery = deliverContent({
        fullText,
        detail,
        artifactsDir: context.artifactsDir,
        spill: {
          title: item.title,
          videoId: id,
          lines: [JSON.stringify({ videoId: id, title: item.title, description: fullText })],
        },
      });

      const { description: _description, ...rest } = item;
      videos[id] = delivery.inlineText !== undefined ? { ...rest, description: delivery.inlineText } : rest;
      fieldsList.push(delivery.fields);
      if (delivery.fields.preview !== undefined) {
        previews.push({ videoId: id, text: delivery.fields.preview });
      }
    }

    const merged = mergeFields(...fieldsList);
    const preview = joinPreviews(previews);
    if (preview !== undefined) merged.preview = preview;
    merged.records = Object.values(videos).filter((video) => video !== null).length;

    return { ok: true, data: { videos }, fields: merged };
  },
};
