/**
 * YouTube Data API v3 reads (tickets G2/R3).
 *
 * Every function returns a `Failure` instead of throwing on expected errors,
 * so the tool seam can treat failure as data. One transport with a request
 * timeout; the transport is injectable for tests.
 */

import type { Failure, FetchLike } from "../tools/types.ts";
import { classifyFetchError, classifyYoutubeApiFailure } from "./failures.ts";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_VIDEO_IDS = 10;

export type ApiAuth =
  | { kind: "api_key"; apiKey: string }
  | { kind: "bearer"; accessToken: string };

export interface ApiOptions {
  auth: ApiAuth;
  fetchFn?: FetchLike | undefined;
  signal?: AbortSignal | undefined;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: Failure };

export interface SearchResult {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  descriptionSnippet: string | null;
}

export interface VideoDetails {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  /** ISO 8601 duration, e.g. `PT1H2M3S`. */
  duration: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  description?: string;
}

export interface Subscription {
  channelId: string;
  title: string;
  /** When the user subscribed — not when the channel was created. */
  publishedAt: string;
  url: string;
}

export interface SubscriptionsPage {
  totalResults?: number;
  subscriptions: Subscription[];
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

/** YouTube escapes title and description entities; decode them for display. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

export function parseYouTubeNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function callYoutube(
  path: string,
  params: Record<string, string>,
  options: ApiOptions,
): Promise<ApiResult<unknown>> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {};
  if (options.auth.kind === "api_key") {
    url.searchParams.set("key", options.auth.apiKey);
  } else {
    headers["authorization"] = `Bearer ${options.auth.accessToken}`;
  }

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const fetchFn: FetchLike = options.fetchFn ?? (fetch as FetchLike);

  let response;
  try {
    response = await fetchFn(url.toString(), { headers, signal });
  } catch (error) {
    return { ok: false, error: classifyFetchError(error) };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    return { ok: false, error: classifyYoutubeApiFailure(response.status, body) };
  }
  return { ok: true, data: body };
}

interface SearchResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
    };
  }>;
}

export async function searchVideos(
  input: { query: string; maxResults?: number; order?: "relevance" | "date" | "viewCount" },
  options: ApiOptions,
): Promise<ApiResult<SearchResult[]>> {
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10);
  const result = await callYoutube(
    "/search",
    {
      part: "snippet",
      q: input.query,
      maxResults: String(maxResults),
      type: "video",
      order: input.order ?? "relevance",
    },
    options,
  );
  if (!result.ok) return result;

  const body = (result.data ?? {}) as SearchResponse;
  const results: SearchResult[] = [];
  for (const item of body.items ?? []) {
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    results.push({
      videoId,
      title: decodeHtmlEntities(item.snippet?.title ?? ""),
      channelId: item.snippet?.channelId ?? "",
      channelTitle: decodeHtmlEntities(item.snippet?.channelTitle ?? ""),
      publishedAt: item.snippet?.publishedAt ?? "",
      descriptionSnippet: item.snippet?.description
        ? decodeHtmlEntities(item.snippet.description)
        : null,
    });
  }
  return { ok: true, data: results };
}

interface VideosResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
    };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails?: { duration?: string };
  }>;
}

export async function getVideoDetails(
  videoIds: string[],
  options: ApiOptions,
): Promise<ApiResult<Record<string, VideoDetails | null>>> {
  const uniqueIds = [...new Set(videoIds.filter((id) => id.length > 0))].slice(0, MAX_VIDEO_IDS);
  if (uniqueIds.length === 0) return { ok: true, data: {} };

  const result = await callYoutube(
    "/videos",
    { part: "snippet,statistics,contentDetails", id: uniqueIds.join(",") },
    options,
  );
  if (!result.ok) return result;

  const body = (result.data ?? {}) as VideosResponse;
  const byId = new Map<string, VideoDetails>();
  for (const item of body.items ?? []) {
    if (!item.id) continue;
    const details: VideoDetails = {
      id: item.id,
      title: decodeHtmlEntities(item.snippet?.title ?? ""),
      channelId: item.snippet?.channelId ?? "",
      channelTitle: decodeHtmlEntities(item.snippet?.channelTitle ?? ""),
      publishedAt: item.snippet?.publishedAt ?? "",
      duration: item.contentDetails?.duration ?? null,
      viewCount: parseYouTubeNumber(item.statistics?.viewCount),
      likeCount: parseYouTubeNumber(item.statistics?.likeCount),
      commentCount: parseYouTubeNumber(item.statistics?.commentCount),
    };
    if (item.snippet?.description) {
      details.description = decodeHtmlEntities(item.snippet.description);
    }
    byId.set(item.id, details);
  }

  const data: Record<string, VideoDetails | null> = {};
  for (const id of uniqueIds) {
    data[id] = byId.get(id) ?? null;
  }
  return { ok: true, data };
}

interface SubscriptionsResponse {
  pageInfo?: { totalResults?: number };
  items?: Array<{
    snippet?: {
      title?: string;
      resourceId?: { channelId?: string };
      publishedAt?: string;
    };
  }>;
}

export async function getSubscriptions(
  input: {
    maxResults?: number;
    order?: "alphabetical" | "relevance" | "unread";
    channelId?: string;
  },
  options: ApiOptions,
): Promise<ApiResult<SubscriptionsPage>> {
  const maxResults = Math.min(Math.max(input.maxResults ?? 25, 1), 50);
  const params: Record<string, string> = {
    part: "snippet",
    mine: "true",
    maxResults: String(maxResults),
  };
  if (input.order) params["order"] = input.order;
  // `forChannelId` is the modifier for "am I subscribed to this channel?".
  if (input.channelId) params["forChannelId"] = input.channelId;

  const result = await callYoutube("/subscriptions", params, options);
  if (!result.ok) return result;

  const body = (result.data ?? {}) as SubscriptionsResponse;
  const subscriptions: Subscription[] = [];
  for (const item of body.items ?? []) {
    const channelId = item.snippet?.resourceId?.channelId ?? "";
    subscriptions.push({
      channelId,
      title: decodeHtmlEntities(item.snippet?.title ?? ""),
      publishedAt: item.snippet?.publishedAt ?? "",
      url: `https://www.youtube.com/channel/${channelId}`,
    });
  }

  const page: SubscriptionsPage = { subscriptions };
  const totalResults = body.pageInfo?.totalResults;
  if (typeof totalResults === "number") page.totalResults = totalResults;
  return { ok: true, data: page };
}
