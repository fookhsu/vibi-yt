import { Type } from "typebox";
import { StringEnum } from "../lib/schema.ts";
import { searchVideos, getVideoDetails } from "../lib/youtube-api.ts";
import {
  getTranscriptWithDiagnostics,
  type TranscriptDiagnostic,
  type TranscriptFormat,
  type TranscriptResult,
} from "../lib/transcript.ts";
import { requireVideoId, resolveVideoIds } from "../lib/video-id.ts";
import {
  formatSearchResults,
  formatToolError,
  formatTranscriptMap,
  formatVideoDetailsMap,
  formatDescription,
  MAX_DESCRIPTION_CHARS,
  compactSearchResultDetails,
  compactTranscriptDetails,
  compactVideoDetailsMap,
} from "../lib/formatters.ts";
import type { AnyYoutubeToolSpec, ToolOutcome, YoutubeToolSpec } from "./types.ts";

function ok(text: string, data: Record<string, unknown> = {}): ToolOutcome {
  return { text, data };
}

function fail(error: unknown): ToolOutcome {
  const message = formatToolError(error);
  return { text: message, data: { error: message }, isError: true };
}

export interface YoutubeSearchInput {
  query: string;
  maxResults?: number;
  order?: "relevance" | "date" | "viewCount";
}

export const youtubeSearchTool: YoutubeToolSpec<YoutubeSearchInput> = {
  name: "youtube_search",
  label: "YouTube Search",
  description:
    "Search YouTube videos by query using YouTube Data API v3. Returns videoId, title, channel, and snippet for gameplay or topic research.",
  promptSnippet: "Search YouTube videos by query and return lean video metadata",
  promptGuidelines: [
    "Use youtube_search when you need to discover YouTube videos by topic, game name, or keyword.",
    "Prefer youtube_search over web search for structured YouTube video discovery.",
    "Follow with youtube_video_details or youtube_transcript once you have a videoId.",
    "Keep maxResults small (default 5) unless the user explicitly needs a broader scan.",
  ],
  parameters: Type.Object({
    query: Type.String({ description: "Search query, e.g. 'Roblox Hunty Zombie gameplay'." }),
    maxResults: Type.Optional(
      Type.Number({ default: 5, description: "Maximum results to return (1-10, default 5)." }),
    ),
    order: Type.Optional(
      StringEnum(["relevance", "date", "viewCount"], {
        default: "relevance",
        description: "Sort order for search results.",
      }),
    ),
  }),
  async execute(params) {
    try {
      const results = await searchVideos(params.query, {
        maxResults: params.maxResults,
        order: params.order,
      });
      const compactResults = compactSearchResultDetails(results);
      const text = formatSearchResults(params.query, results);
      return ok(text, { query: params.query, count: results.length, results: compactResults });
    } catch (error) {
      return fail(error);
    }
  },
};

export interface YoutubeVideoDetailsInput {
  videoId?: string;
  videoIds?: string[];
  includeDescription?: boolean;
}

export const youtubeVideoDetailsTool: YoutubeToolSpec<YoutubeVideoDetailsInput> = {
  name: "youtube_video_details",
  label: "YouTube Video Details",
  description:
    "Get structured metadata and statistics for one or more YouTube videos by videoId or URL.",
  promptSnippet: "Get YouTube video metadata, stats, and optional description",
  promptGuidelines: [
    "Use youtube_video_details after youtube_search or when the user provides a YouTube URL/videoId.",
    "Set includeDescription=true only when a longer description is needed; it increases token usage.",
  ],
  parameters: Type.Object({
    videoId: Type.Optional(Type.String({ description: "Single YouTube video ID or URL." })),
    videoIds: Type.Optional(
      Type.Array(Type.String(), {
        description: "Multiple YouTube video IDs or URLs (max 10).",
        maxItems: 10,
      }),
    ),
    includeDescription: Type.Optional(
      Type.Boolean({
        default: false,
        description: `Include truncated description text (up to ${MAX_DESCRIPTION_CHARS} chars per video).`,
      }),
    ),
  }),
  async execute(params) {
    try {
      const inputs = [
        ...(params.videoId ? [params.videoId] : []),
        ...(params.videoIds ?? []),
      ];
      if (inputs.length === 0) {
        return { text: "Provide videoId or videoIds.", data: { error: "missing_input" }, isError: true };
      }

      const ids = resolveVideoIds(inputs);
      const raw = await getVideoDetails(ids, {
        includeDescription: params.includeDescription === true,
      });

      const details = Object.fromEntries(
        Object.entries(raw).map(([id, item]) => {
          if (!item) return [id, null];
          const description = formatDescription(item.description, params.includeDescription === true);
          return [
            id,
            description === undefined ? { ...item, description: undefined } : { ...item, description },
          ];
        }),
      );
      const compactDetails = compactVideoDetailsMap(details);

      const text = formatVideoDetailsMap(compactDetails);
      return ok(text, { count: ids.length, details: compactDetails });
    } catch (error) {
      return fail(error);
    }
  },
};

export interface YoutubeTranscriptInput {
  videoId?: string;
  videoIds?: string[];
  lang?: string;
  format?: TranscriptFormat;
}

export const youtubeTranscriptTool: YoutubeToolSpec<YoutubeTranscriptInput> = {
  name: "youtube_transcript",
  label: "YouTube Transcript",
  description:
    "Fetch a YouTube transcript by videoId or URL. Defaults to an intro/outro excerpt to save tokens.",
  promptSnippet: "Fetch YouTube transcript segments for a video",
  promptGuidelines: [
    "Use youtube_transcript when you need spoken content from a specific YouTube video.",
    "Default format excerpt returns hook/outro only; use full_text only when needed because transcript text is capped for safety.",
    "Transcript availability depends on captions; unavailable videos return transcript unavailable.",
  ],
  parameters: Type.Object({
    videoId: Type.Optional(Type.String({ description: "Single YouTube video ID or URL." })),
    videoIds: Type.Optional(
      Type.Array(Type.String(), {
        description: "Multiple YouTube video IDs or URLs (max 5).",
        maxItems: 5,
      }),
    ),
    lang: Type.Optional(
      Type.String({ default: "en", description: "Caption language code, e.g. en, ja." }),
    ),
    format: Type.Optional(
      StringEnum(["excerpt", "full_text"], {
        default: "excerpt",
        description: "excerpt returns hook/outro; full_text returns capped transcript text.",
      }),
    ),
  }),
  async execute(params) {
    try {
      const inputs = [
        ...(params.videoId ? [params.videoId] : []),
        ...(params.videoIds ?? []),
      ];
      if (inputs.length === 0) {
        return { text: "Provide videoId or videoIds.", data: { error: "missing_input" }, isError: true };
      }

      const ids = inputs.map((input) => requireVideoId(input));
      const uniqueIds = [...new Set(ids)];
      const format = (params.format ?? "excerpt") as TranscriptFormat;
      const lang = params.lang ?? "en";

      const entries = await Promise.all(
        uniqueIds.map(async (id) => [
          id,
          await getTranscriptWithDiagnostics(id, { lang, format }),
        ] as const),
      );
      const transcripts: Record<string, TranscriptResult | null> = {};
      const transcriptDiagnostics: Record<string, TranscriptDiagnostic> = {};
      for (const [id, result] of entries) {
        transcripts[id] = result.transcript;
        if (result.diagnostic) {
          transcriptDiagnostics[id] = result.diagnostic;
        }
      }

      const compactTranscripts = compactTranscriptDetails(transcripts);
      const text = formatTranscriptMap(transcripts, transcriptDiagnostics);
      return ok(text, {
        count: uniqueIds.length,
        transcripts: compactTranscripts,
        transcriptDiagnostics,
      });
    } catch (error) {
      return fail(error);
    }
  },
};

export const youtubeTools: AnyYoutubeToolSpec[] = [
  youtubeSearchTool,
  youtubeVideoDetailsTool,
  youtubeTranscriptTool,
];
