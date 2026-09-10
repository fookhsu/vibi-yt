import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyFetchError,
  classifyYoutubeApiFailure,
  failure,
} from "../lib/failures.ts";

test("failure() carries the closed-set label plus an executable hint and retryable", () => {
  const f = failure("not_authorized");
  assert.equal(f.code, "not_authorized");
  assert.equal(typeof f.hint, "string");
  assert.ok(f.hint.length > 0);
  assert.equal(f.retryable, true);
});

test("failure() accepts a context-specific hint override", () => {
  const f = failure("quota_exceeded", "Quota resets at midnight Pacific.");
  assert.equal(f.hint, "Quota resets at midnight Pacific.");
  assert.equal(f.retryable, false);
});

test("quotaExceeded 403 is not retryable", () => {
  const f = classifyYoutubeApiFailure(403, {
    error: { errors: [{ reason: "quotaExceeded" }] },
  });
  assert.equal(f.code, "quota_exceeded");
  assert.equal(f.retryable, false);
});

test("dailyLimitExceeded and rateLimitExceeded 403 are quota", () => {
  assert.equal(
    classifyYoutubeApiFailure(403, { error: { errors: [{ reason: "dailyLimitExceeded" }] } }).code,
    "quota_exceeded",
  );
  assert.equal(
    classifyYoutubeApiFailure(403, { error: { errors: [{ reason: "rateLimitExceeded" }] } }).code,
    "quota_exceeded",
  );
});

test("401 is not_authorized", () => {
  const f = classifyYoutubeApiFailure(401, { error: { message: "Invalid Credentials" } });
  assert.equal(f.code, "not_authorized");
});

test("403 accessNotConfigured points at enabling the API without an auth-family code", () => {
  const f = classifyYoutubeApiFailure(403, {
    error: { errors: [{ reason: "accessNotConfigured" }], message: "YouTube Data API v3 has not been used" },
  });
  assert.equal(f.code, "not_authorized");
  assert.match(f.hint, /enable/i);
  assert.equal(f.retryable, false);
});

test("404 is not_found and not retryable", () => {
  const f = classifyYoutubeApiFailure(404, { error: { message: "Video not found" } });
  assert.equal(f.code, "not_found");
  assert.equal(f.retryable, false);
});

test("400 is invalid_input", () => {
  const f = classifyYoutubeApiFailure(400, { error: { message: "Invalid value" } });
  assert.equal(f.code, "invalid_input");
  assert.equal(f.retryable, false);
});

test("5xx is retryable network_or_upstream_error", () => {
  const f = classifyYoutubeApiFailure(503, { error: { message: "backend error" } });
  assert.equal(f.code, "network_or_upstream_error");
  assert.equal(f.retryable, true);
});

test("a YouTube API key error message is not leaked verbatim", () => {
  const secret = "AIzaSySUPERSECRETKEYVALUE";
  const f = classifyYoutubeApiFailure(400, {
    error: { message: `API key not valid. Please pass a valid API key. key=${secret}` },
  });
  assert.ok(!f.hint.includes(secret), "hint must not echo upstream text containing the key");
});

test("fetch TypeError is retryable network_or_upstream_error", () => {
  const f = classifyFetchError(new TypeError("fetch failed"));
  assert.equal(f.code, "network_or_upstream_error");
  assert.equal(f.retryable, true);
});

test("abort and timeout errors are retryable network_or_upstream_error", () => {
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.equal(classifyFetchError(abort).code, "network_or_upstream_error");
  const timeout = new Error("timed out");
  timeout.name = "TimeoutError";
  assert.equal(classifyFetchError(timeout).retryable, true);
});
