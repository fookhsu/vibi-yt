import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { credentialPaths, writeTokenFile } from "../lib/credentials.ts";
import { youtubeSearch } from "../tools/youtube-search.ts";
import { youtubeSubscriptions } from "../tools/youtube-subscriptions.ts";
import { youtubeTranscript } from "../tools/youtube-transcript.ts";
import { youtubeVideoDetails } from "../tools/youtube-video-details.ts";
import type { FetchLike, ToolContext } from "../tools/types.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vibi-tools-"));
}

function fakeFetch(handler: (url: string) => { status: number; body: unknown }): FetchLike {
  return async (input) => {
    const { status, body } = handler(String(input));
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return { agentDir: tmpDir(), ...overrides };
}

function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("youtube_search returns data and render fields, never model-facing text", async () => {
  await withEnv({ YOUTUBE_API_KEY: "K", YOUTUBE_OAUTH_REFRESH_TOKEN: undefined }, async () => {
    const fetchFn = fakeFetch(() => ({
      status: 200,
      body: {
        items: [
          {
            id: { videoId: "v1" },
            snippet: { title: "T", channelId: "c", channelTitle: "C", publishedAt: "2026-01-01T00:00:00Z" },
          },
        ],
      },
    }));
    const result = await youtubeSearch.execute({ query: "kittens" }, context({ fetchFn }));
    assert.equal(result.ok, true);
    assert.ok(!("text" in result), "the tool result must not carry model-facing text");
    if (!result.ok) return;
    assert.equal(result.data.query, "kittens");
    assert.equal(result.data.results.length, 1);
    assert.equal(result.fields.records, 1);
    assert.equal(result.fields.truncated, false);
    assert.deepEqual(result.fields.spilled, []);
  });
});

test("youtube_search reports not_authorized instead of throwing when no key exists", async () => {
  await withEnv({ YOUTUBE_API_KEY: undefined }, async () => {
    const result = await youtubeSearch.execute({ query: "x" }, context());
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error.code, "not_authorized");
  });
});

test("youtube_video_details compact omits the description but previews it", async () => {
  await withEnv({ YOUTUBE_API_KEY: "K" }, async () => {
    const fetchFn = fakeFetch(() => ({
      status: 200,
      body: {
        items: [
          {
            id: "v1",
            snippet: { title: "T", description: "short description", channelId: "c", channelTitle: "C", publishedAt: "2026-01-01T00:00:00Z" },
            statistics: { viewCount: "5" },
            contentDetails: { duration: "PT1M" },
          },
        ],
      },
    }));
    const result = await youtubeVideoDetails.execute({ videoIds: ["v1"] }, context({ fetchFn }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.videos["v1"]?.description, undefined);
    assert.equal(result.fields.preview, "short description");
    assert.equal(result.fields.truncated, false);
  });
});

test("youtube_video_details full inlines a short description", async () => {
  await withEnv({ YOUTUBE_API_KEY: "K" }, async () => {
    const fetchFn = fakeFetch(() => ({
      status: 200,
      body: {
        items: [
          {
            id: "v1",
            snippet: { title: "T", description: "small", channelId: "c", channelTitle: "C", publishedAt: "2026-01-01T00:00:00Z" },
          },
        ],
      },
    }));
    const result = await youtubeVideoDetails.execute({ videoIds: ["v1"], detail: "full" }, context({ fetchFn }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.videos["v1"]?.description, "small");
    assert.deepEqual(result.fields.spilled, []);
  });
});

test("youtube_video_details full spills a long description", async () => {
  await withEnv({ YOUTUBE_API_KEY: "K" }, async () => {
    const longDescription = "d".repeat(9_000);
    const fetchFn = fakeFetch(() => ({
      status: 200,
      body: {
        items: [
          {
            id: "v1",
            snippet: { title: "Big Video", description: longDescription, channelId: "c", channelTitle: "C", publishedAt: "2026-01-01T00:00:00Z" },
          },
        ],
      },
    }));
    const result = await youtubeVideoDetails.execute(
      { videoIds: ["v1"], detail: "full" },
      context({ fetchFn, artifactsDir: tmpDir() }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.fields.spilled.length, 1);
    assert.equal(result.fields.truncated, false);
    assert.equal(result.data.videos["v1"]?.description, undefined);
    assert.ok(fs.existsSync(result.fields.spilled[0]!.path));
  });
});

test("youtube_video_details rejects an empty id list as invalid_input", async () => {
  const result = await youtubeVideoDetails.execute({ videoIds: [] }, context());
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "invalid_input");
});

test("youtube_transcript compact previews and marks truncation on long captions", async () => {
  await withEnv({ YOUTUBE_API_KEY: undefined }, async () => {
    const long = "word ".repeat(2_000);
    const result = await youtubeTranscript.execute(
      { videoIds: ["v1"] },
      context({
        transcriptFetcher: async () => [{ offset: 0, duration: 1, text: long }],
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.transcripts["v1"]?.segments, 1);
    assert.equal(result.data.transcripts["v1"]?.text, undefined);
    assert.equal(result.fields.truncated, true);
    assert.ok((result.fields.preview ?? "").length > 0);
    assert.deepEqual(result.fields.spilled, []);
  });
});

test("youtube_transcript full inlines a short transcript", async () => {
  const result = await youtubeTranscript.execute(
    { videoIds: ["v1"], detail: "full" },
    context({ transcriptFetcher: async () => [{ offset: 0, duration: 1, text: "hello world" }] }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.transcripts["v1"]?.text, "hello world");
  assert.equal(result.fields.truncated, false);
});

test("youtube_transcript reports a per-video failure alongside successes", async () => {
  const result = await youtubeTranscript.execute(
    { videoIds: ["good", "bad"] },
    context({
      transcriptFetcher: async (videoId) => {
        if (videoId === "bad") {
          const error = new Error("disabled");
          error.name = "YoutubeTranscriptDisabledError";
          throw error;
        }
        return [{ offset: 0, duration: 1, text: "ok" }];
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.data.transcripts["good"]);
  assert.equal(result.data.failures?.["bad"]?.code, "transcript_unavailable");
});

test("youtube_transcript returns a failure when every video fails", async () => {
  const result = await youtubeTranscript.execute(
    { videoIds: ["bad"] },
    context({
      transcriptFetcher: async () => {
        const error = new Error("disabled");
        error.name = "YoutubeTranscriptDisabledError";
        throw error;
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "transcript_unavailable");
});

test("youtube_subscriptions needs authorization before any network call", async () => {
  await withEnv({ YOUTUBE_OAUTH_REFRESH_TOKEN: undefined }, async () => {
    let called = false;
    const fetchFn: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const result = await youtubeSubscriptions.execute({}, context({ fetchFn }));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error.code, "not_authorized");
    assert.equal(called, false);
  });
});

test("youtube_subscriptions returns channels with a prefilled url", async () => {
  await withEnv({ YOUTUBE_OAUTH_REFRESH_TOKEN: undefined }, async () => {
    const dir = tmpDir();
    writeTokenFile(credentialPaths(dir).tokenFile, {
      client_id: "cid",
      refresh_token: "r",
      access_token: "valid",
      expires_at: Date.now() + 3_600_000,
      obtained_at: new Date().toISOString(),
    });
    const fetchFn = fakeFetch(() => ({
      status: 200,
      body: {
        pageInfo: { totalResults: 98 },
        items: [
          {
            snippet: { title: "Chan", resourceId: { channelId: "UC1" }, publishedAt: "2020-01-01T00:00:00Z" },
          },
        ],
      },
    }));

    const result = await youtubeSubscriptions.execute({}, { agentDir: dir, fetchFn });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.totalResults, 98);
    assert.equal(result.data.subscriptions[0]?.url, "https://www.youtube.com/channel/UC1");
    assert.equal(result.fields.records, 1);
  });
});
