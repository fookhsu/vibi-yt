import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getSubscriptions,
  getVideoDetails,
  searchVideos,
} from "../lib/youtube-api.ts";
import type { FetchLike } from "../tools/types.ts";

interface Captured {
  url: string;
}

function fakeFetch(
  handler: (url: string) => { status: number; body: unknown },
  captured: Captured[] = [],
): FetchLike {
  return async (input) => {
    const url = String(input);
    captured.push({ url });
    const { status, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
}

const API_KEY_AUTH = { kind: "api_key", apiKey: "KEY" } as const;
const BEARER_AUTH = { kind: "bearer", accessToken: "TOKEN" } as const;

test("searchVideos sets query params, uses the API key, and maps results", async () => {
  const captured: Captured[] = [];
  const fetchFn = fakeFetch(
    () => ({
      status: 200,
      body: {
        items: [
          {
            id: { videoId: "v1" },
            snippet: {
              title: "Title &amp; more",
              channelId: "c1",
              channelTitle: "Channel",
              publishedAt: "2026-01-01T00:00:00Z",
              description: "desc",
            },
          },
        ],
      },
    }),
    captured,
  );

  const result = await searchVideos(
    { query: "cats", maxResults: 3, order: "date" },
    { auth: API_KEY_AUTH, fetchFn },
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data[0]?.videoId, "v1");
  assert.equal(result.ok && result.data[0]?.title, "Title & more");
  const url = new URL(captured[0]!.url);
  assert.equal(url.pathname, "/youtube/v3/search");
  assert.equal(url.searchParams.get("q"), "cats");
  assert.equal(url.searchParams.get("maxResults"), "3");
  assert.equal(url.searchParams.get("order"), "date");
  assert.equal(url.searchParams.get("type"), "video");
  assert.equal(url.searchParams.get("key"), "KEY");
});

test("getVideoDetails preserves requested order and nulls missing videos", async () => {
  const fetchFn = fakeFetch(() => ({
    status: 200,
    body: {
      items: [
        {
          id: "b",
          snippet: { title: "B", channelId: "c", channelTitle: "C", publishedAt: "2026-01-02T00:00:00Z" },
          statistics: { viewCount: "1000", likeCount: "10", commentCount: "2" },
          contentDetails: { duration: "PT1H2M3S" },
        },
      ],
    },
  }));

  const result = await getVideoDetails(["a", "b"], { auth: API_KEY_AUTH, fetchFn });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(Object.keys(result.data), ["a", "b"]);
  assert.equal(result.data["a"], null);
  assert.equal(result.data["b"]?.viewCount, 1000);
  assert.equal(result.data["b"]?.duration, "PT1H2M3S");
});

test("getSubscriptions uses bearer auth, mine=true, and builds channel URLs", async () => {
  const captured: Captured[] = [];
  const fetchFn = fakeFetch(
    () => ({
      status: 200,
      body: {
        pageInfo: { totalResults: 98 },
        items: [
          {
            snippet: {
              title: "Some Channel",
              resourceId: { channelId: "UC123" },
              publishedAt: "2020-05-05T00:00:00Z",
            },
          },
        ],
      },
    }),
    captured,
  );

  const result = await getSubscriptions(
    { maxResults: 25 },
    { auth: BEARER_AUTH, fetchFn },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.totalResults, 98);
  assert.equal(result.data.subscriptions[0]?.channelId, "UC123");
  assert.equal(result.data.subscriptions[0]?.title, "Some Channel");
  assert.equal(result.data.subscriptions[0]?.url, "https://www.youtube.com/channel/UC123");

  const url = new URL(captured[0]!.url);
  assert.equal(url.pathname, "/youtube/v3/subscriptions");
  assert.equal(url.searchParams.get("mine"), "true");
  assert.equal(url.searchParams.get("maxResults"), "25");
  assert.equal(url.searchParams.get("part"), "snippet");
  assert.equal(url.searchParams.get("key"), null, "bearer auth must not add an API key");
});

test("getSubscriptions sends channelId as forChannelId", async () => {
  const captured: Captured[] = [];
  const fetchFn = fakeFetch(() => ({ status: 200, body: { items: [] } }), captured);
  await getSubscriptions({ channelId: "UC999" }, { auth: BEARER_AUTH, fetchFn });
  const url = new URL(captured[0]!.url);
  assert.equal(url.searchParams.get("forChannelId"), "UC999");
});

test("a 403 quotaExceeded becomes a quota_exceeded failure", async () => {
  const fetchFn = fakeFetch(() => ({
    status: 403,
    body: { error: { errors: [{ reason: "quotaExceeded" }] } },
  }));
  const result = await searchVideos({ query: "x" }, { auth: API_KEY_AUTH, fetchFn });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "quota_exceeded");
  assert.equal(result.ok === false && result.error.retryable, false);
});

test("a thrown network error becomes a retryable network_or_upstream_error", async () => {
  const fetchFn: FetchLike = async () => {
    throw new TypeError("fetch failed");
  };
  const result = await searchVideos({ query: "x" }, { auth: API_KEY_AUTH, fetchFn });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "network_or_upstream_error");
  assert.equal(result.ok === false && result.error.retryable, true);
});

test("a non-JSON error body does not throw", async () => {
  const fetchFn: FetchLike = async () => ({
    ok: false,
    status: 500,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  });
  const result = await getVideoDetails(["a"], { auth: API_KEY_AUTH, fetchFn });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "network_or_upstream_error");
});
