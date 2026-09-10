import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchTranscriptSegments, fullTranscriptText } from "../lib/transcript.ts";

test("segments are normalized to start/dur and joined into one text", async () => {
  const result = await fetchTranscriptSegments("vid", {
    lang: "en",
    fetcher: async () => [
      { offset: 0, duration: 2, text: "hello" },
      { offset: 2, duration: 3, text: "world" },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.segments[0], { start: 0, dur: 2, text: "hello" });
  assert.equal(fullTranscriptText(result.segments), "hello world");
});

test("an empty caption track is transcript_unavailable", async () => {
  const result = await fetchTranscriptSegments("vid", { fetcher: async () => [] });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "transcript_unavailable");
});

test("a missing language carries the available languages into the hint", async () => {
  const error = new Error("no such language");
  error.name = "YoutubeTranscriptNotAvailableLanguageError";
  Object.assign(error, { availableLangs: ["en", "de", "ja"] });

  const result = await fetchTranscriptSegments("vid", {
    lang: "fr",
    fetcher: async () => {
      throw error;
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "transcript_unavailable");
  assert.ok(result.error.hint.includes("en"));
  assert.ok(result.error.hint.includes("de"));
});

test("a disabled or missing caption track is transcript_unavailable", async () => {
  const error = new Error("disabled");
  error.name = "YoutubeTranscriptDisabledError";
  const result = await fetchTranscriptSegments("vid", {
    fetcher: async () => {
      throw error;
    },
  });
  assert.equal(result.ok === false && result.error.code, "transcript_unavailable");
});

test("an unavailable video is not_found", async () => {
  const error = new Error("gone");
  error.name = "YoutubeTranscriptVideoUnavailableError";
  const result = await fetchTranscriptSegments("vid", {
    fetcher: async () => {
      throw error;
    },
  });
  assert.equal(result.ok === false && result.error.code, "not_found");
});

test("an unexpected provider error is a retryable network error, not a silent captions claim", async () => {
  const result = await fetchTranscriptSegments("vid", {
    fetcher: async () => {
      throw new Error("kaboom");
    },
  });
  assert.equal(result.ok === false && result.error.code, "network_or_upstream_error");
  assert.equal(result.ok === false && result.error.retryable, true);
});

test("a rate-limited provider is retryable", async () => {
  const error = new Error("429");
  error.name = "YoutubeTranscriptTooManyRequestError";
  const result = await fetchTranscriptSegments("vid", {
    fetcher: async () => {
      throw error;
    },
  });
  assert.equal(result.ok === false && result.error.code, "network_or_upstream_error");
  assert.equal(result.ok === false && result.error.retryable, true);
});
