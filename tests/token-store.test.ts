import { test } from "node:test";
import assert from "node:assert/strict";

import {
  accessTokenSecondsRemaining,
  needsRefresh,
  tokenFromResponse,
} from "../lib/token-store.ts";

const NOW = new Date("2026-09-11T00:00:00Z");

test("tokenFromResponse derives an absolute expires_at from expires_in", () => {
  const record = tokenFromResponse(
    { access_token: "a", refresh_token: "r", expires_in: 3600, scope: "youtube.readonly" },
    { clientId: "cid", priorRefreshToken: undefined, now: NOW },
  );
  assert.equal(record.client_id, "cid");
  assert.equal(record.refresh_token, "r");
  assert.equal(record.expires_at, NOW.getTime() + 3_600_000);
  assert.equal(record.obtained_at, NOW.toISOString());
  assert.equal(record.scope, "youtube.readonly");
});

test("a refresh response without a refresh_token keeps the prior one", () => {
  const record = tokenFromResponse(
    { access_token: "new", expires_in: 3600 },
    { clientId: "cid", priorRefreshToken: "old-refresh", now: NOW },
  );
  assert.equal(record.refresh_token, "old-refresh");
  assert.equal(record.access_token, "new");
});

test("tokenFromResponse refuses to lose the refresh token when there is no prior", () => {
  assert.throws(
    () =>
      tokenFromResponse(
        { access_token: "a", expires_in: 3600 },
        { clientId: "cid", priorRefreshToken: undefined, now: NOW },
      ),
    /refresh_token/,
  );
});

test("needsRefresh is true within the 60-second skew", () => {
  assert.equal(needsRefresh({ expires_at: NOW.getTime() + 30_000 }, NOW), true);
  assert.equal(needsRefresh({ expires_at: NOW.getTime() + 59_000 }, NOW), true);
  assert.equal(needsRefresh({ expires_at: NOW.getTime() + 61_000 }, NOW), false);
});

test("an expired or absent expires_at needs refresh", () => {
  assert.equal(needsRefresh({ expires_at: NOW.getTime() - 1 }, NOW), true);
  assert.equal(needsRefresh({}, NOW), true);
});

test("accessTokenSecondsRemaining reports remaining seconds and clamps at zero", () => {
  assert.equal(accessTokenSecondsRemaining({ expires_at: NOW.getTime() + 5_000 }, NOW), 5);
  assert.equal(accessTokenSecondsRemaining({ expires_at: NOW.getTime() - 5_000 }, NOW), 0);
  assert.equal(accessTokenSecondsRemaining({}, NOW), undefined);
});
