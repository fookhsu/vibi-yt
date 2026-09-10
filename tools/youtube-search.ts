import { Type, type Static } from "typebox";

import { resolveApiKeyAuth } from "../lib/auth-session.ts";
import { searchVideos, type SearchResult } from "../lib/youtube-api.ts";
import { clampResults, failureFields } from "./shared.ts";
import type { Tool, ToolResult } from "./types.ts";

export const searchInputSchema = Type.Object({
  query: Type.String({ description: "Keywords to search for." }),
  maxResults: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 10, default: 5, description: "How many results to return (1-10, default 5)." }),
  ),
  order: Type.Optional(
    Type.Union(
      [
        Type.Literal("relevance", { description: "Most relevant first (default)." }),
        Type.Literal("date", { description: "Newest first." }),
        Type.Literal("viewCount", { description: "Most viewed first." }),
      ],
      { description: "Result ordering." },
    ),
  ),
});

export type SearchInput = Static<typeof searchInputSchema>;

export interface SearchData {
  query: string;
  results: SearchResult[];
}

const DESCRIPTION =
  "Search YouTube videos by keyword. Returns up to 10 videos with videoId, title, channel, publish date and a short description snippet. `order` may be relevance (default), date, or viewCount. There is no pagination: one call returns one page of results.";

export const youtubeSearch: Tool<SearchInput, SearchData> = {
  name: "youtube_search",
  description: DESCRIPTION,
  promptSnippet: "Search YouTube videos by keyword",
  promptGuidelines: ["Use youtube_search when the user asks to find videos by topic or keyword."],
  parameters: searchInputSchema,

  async execute(input, context): Promise<ToolResult<SearchData>> {
    const auth = resolveApiKeyAuth({
      agentDir: context.agentDir,
      env: process.env,
      fetchFn: context.fetchFn,
      signal: context.signal,
    });
    if (!auth.ok) return { ok: false, error: auth.error, fields: failureFields() };

    const maxResults = clampResults(input.maxResults, 5, 1, 10);
    const result = await searchVideos(
      { query: input.query, maxResults, ...(input.order ? { order: input.order } : {}) },
      { auth: auth.auth, fetchFn: context.fetchFn, signal: context.signal },
    );
    if (!result.ok) return { ok: false, error: result.error, fields: failureFields() };

    return {
      ok: true,
      data: { query: input.query, results: result.data },
      fields: { truncated: false, spilled: [], records: result.data.length },
    };
  },
};
