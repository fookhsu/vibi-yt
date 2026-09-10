import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveApiKeyAuth, resolveOAuthAuth } from "../lib/auth-session.ts";
import { credentialPaths, writeApiKeyFile, writeTokenFile } from "../lib/credentials.ts";
import type { FetchLike } from "../tools/types.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vibi-auth-"));
}

function writeClientJson(dir: string): string {
  const file = path.join(dir, "client.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      web: {
        client_id: "cid",
        client_secret: "shh",
        project_id: "proj",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
      },
    }),
  );
  return file;
}

test("the API-key track reports not_authorized when nothing is configured", () => {
  const result = resolveApiKeyAuth({ agentDir: tmpDir(), env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "not_authorized");
  assert.match(result.ok === false ? result.error.hint : "", /set-api-key|YOUTUBE_API_KEY/);
});

test("the API-key track returns the configured key", () => {
  const result = resolveApiKeyAuth({ agentDir: tmpDir(), env: { YOUTUBE_API_KEY: "K" } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.auth, { kind: "api_key", apiKey: "K" });
});

test("the API-key track never falls back to an OAuth token", () => {
  const dir = tmpDir();
  const paths = credentialPaths(dir);
  fs.mkdirSync(dir, { recursive: true });
  writeTokenFile(paths.tokenFile, {
    client_id: "cid",
    refresh_token: "r",
    access_token: "valid",
    expires_at: Date.now() + 3_600_000,
    obtained_at: new Date().toISOString(),
  });

  const result = resolveApiKeyAuth({ agentDir: dir, env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "not_authorized");
});

test("the OAuth track uses a still-valid access token without a network call", async () => {
  const dir = tmpDir();
  writeTokenFile(credentialPaths(dir).tokenFile, {
    client_id: "cid",
    refresh_token: "r",
    access_token: "fresh",
    expires_at: Date.now() + 3_600_000,
    obtained_at: new Date().toISOString(),
  });

  let called = false;
  const fetchFn: FetchLike = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const result = await resolveOAuthAuth({ agentDir: dir, env: {}, fetchFn });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.auth, { kind: "bearer", accessToken: "fresh" });
  assert.equal(called, false);
});

test("the OAuth track refreshes an expiring token and persists the new one", async () => {
  const dir = tmpDir();
  const paths = credentialPaths(dir);
  writeTokenFile(paths.tokenFile, {
    client_id: "cid",
    refresh_token: "r",
    access_token: "stale",
    expires_at: Date.now() - 1_000,
    obtained_at: new Date().toISOString(),
  });
  const clientPath = writeClientJson(dir);

  const fetchFn: FetchLike = async (input) => {
    assert.equal(input, "https://oauth2.googleapis.com/token");
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: "new", expires_in: 3600 }),
    };
  };

  const result = await resolveOAuthAuth({
    agentDir: dir,
    env: { YOUTUBE_OAUTH_CLIENT_JSON: clientPath },
    fetchFn,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.auth, { kind: "bearer", accessToken: "new" });

  const persisted = JSON.parse(fs.readFileSync(paths.tokenFile, "utf8"));
  assert.equal(persisted.access_token, "new");
  assert.equal(persisted.refresh_token, "r", "the refresh token must survive a refresh");
});

test("the OAuth track reports not_authorized when there is no refresh token", async () => {
  const result = await resolveOAuthAuth({ agentDir: tmpDir(), env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "not_authorized");
  assert.match(result.ok === false ? result.error.hint : "", /authorize/);
});

test("an invalid_grant refresh is not_authorized with a reauthorize hint", async () => {
  const dir = tmpDir();
  writeTokenFile(credentialPaths(dir).tokenFile, {
    client_id: "cid",
    refresh_token: "dead",
    access_token: "stale",
    expires_at: Date.now() - 1_000,
    obtained_at: new Date().toISOString(),
  });
  const clientPath = writeClientJson(dir);

  const fetchFn: FetchLike = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: "invalid_grant" }),
  });

  const result = await resolveOAuthAuth({
    agentDir: dir,
    env: { YOUTUBE_OAUTH_CLIENT_JSON: clientPath },
    fetchFn,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "not_authorized");
});

test("a service-disabled refresh points at enabling the API", async () => {
  const dir = tmpDir();
  writeTokenFile(credentialPaths(dir).tokenFile, {
    client_id: "cid",
    refresh_token: "r",
    access_token: "stale",
    expires_at: Date.now() - 1_000,
    obtained_at: new Date().toISOString(),
  });
  const clientPath = writeClientJson(dir);

  const fetchFn: FetchLike = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: "SERVICE_DISABLED", error_description: "YouTube Data API v3 has not been used" }),
  });

  const result = await resolveOAuthAuth({
    agentDir: dir,
    env: { YOUTUBE_OAUTH_CLIENT_JSON: clientPath },
    fetchFn,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "service_disabled");
});

test("a refresh from an env refresh token works without a token file", async () => {
  const dir = tmpDir();
  const clientPath = writeClientJson(dir);

  const fetchFn: FetchLike = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ access_token: "env-access", expires_in: 3600 }),
  });

  const result = await resolveOAuthAuth({
    agentDir: dir,
    env: { YOUTUBE_OAUTH_REFRESH_TOKEN: "env-refresh", YOUTUBE_OAUTH_CLIENT_JSON: clientPath },
    fetchFn,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.auth, { kind: "bearer", accessToken: "env-access" });
});
