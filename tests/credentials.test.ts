import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  clearApiKeyFile,
  credentialPaths,
  defaultAgentDir,
  resolveApiKey,
  resolveRefreshToken,
  writeApiKeyFile,
  writeTokenFile,
} from "../lib/credentials.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vibi-cred-"));
}

test("defaultAgentDir honours PI_CODING_AGENT_DIR", () => {
  assert.equal(defaultAgentDir({ PI_CODING_AGENT_DIR: "/custom/agent" }, "/home/u"), "/custom/agent");
  assert.equal(defaultAgentDir({}, "/home/u"), path.join("/home/u", ".pi", "agent"));
});

test("credentialPaths places the three named files under the agent dir", () => {
  const paths = credentialPaths("/agent");
  assert.equal(paths.apiKeyFile, path.join("/agent", "vibi-auth.json"));
  assert.equal(paths.tokenFile, path.join("/agent", "vibi-oauth-token.json"));
  assert.equal(paths.clientJson, path.join("/agent", "vibi-oauth-client.json"));
});

test("api key prefers YOUTUBE_API_KEY over the stored file", () => {
  const dir = tmpDir();
  const paths = credentialPaths(dir);
  writeApiKeyFile(paths.apiKeyFile, "stored-key", new Date("2026-01-01T00:00:00Z"));

  const fromEnv = resolveApiKey(paths, { YOUTUBE_API_KEY: "env-key" });
  assert.equal(fromEnv.source, "environment");
  assert.equal(fromEnv.apiKey, "env-key");

  const fromFile = resolveApiKey(paths, {});
  assert.equal(fromFile.source, "stored");
  assert.equal(fromFile.apiKey, "stored-key");

  const none = resolveApiKey(credentialPaths(tmpDir()), {});
  assert.equal(none.source, "none");
  assert.equal(none.apiKey, undefined);
});

test("the api key file is written with 0600 under a 0700 directory", () => {
  const dir = path.join(tmpDir(), "nested");
  const paths = credentialPaths(dir);
  writeApiKeyFile(paths.apiKeyFile, "secret", new Date());
  assert.equal(fs.statSync(paths.apiKeyFile).mode & 0o777, 0o600);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  const raw = JSON.parse(fs.readFileSync(paths.apiKeyFile, "utf8"));
  assert.equal(raw.type, "api_key");
  assert.equal(raw.apiKey, "secret");
});

test("clearApiKeyFile removes the file and reports whether it existed", () => {
  const dir = tmpDir();
  const paths = credentialPaths(dir);
  writeApiKeyFile(paths.apiKeyFile, "secret", new Date());
  assert.equal(clearApiKeyFile(paths.apiKeyFile), true);
  assert.equal(fs.existsSync(paths.apiKeyFile), false);
  assert.equal(clearApiKeyFile(paths.apiKeyFile), false);
});

test("refresh token prefers YOUTUBE_OAUTH_REFRESH_TOKEN over the token file", () => {
  const dir = tmpDir();
  const paths = credentialPaths(dir);
  writeTokenFile(paths.tokenFile, {
    client_id: "cid",
    refresh_token: "file-refresh",
    expires_at: Date.now(),
    obtained_at: new Date().toISOString(),
  });

  const env = resolveRefreshToken(paths, { YOUTUBE_OAUTH_REFRESH_TOKEN: "env-refresh" });
  assert.equal(env.source, "environment");
  assert.equal(env.refreshToken, "env-refresh");

  const file = resolveRefreshToken(paths, {});
  assert.equal(file.source, "token_file");
  assert.equal(file.refreshToken, "file-refresh");

  const none = resolveRefreshToken(credentialPaths(tmpDir()), {});
  assert.equal(none.source, "none");
});

test("the token file is 0600 and round-trips", () => {
  const dir = tmpDir();
  const paths = credentialPaths(dir);
  const record = {
    client_id: "cid",
    refresh_token: "r",
    access_token: "a",
    expires_at: 123,
    scope: "s",
    obtained_at: new Date().toISOString(),
  };
  writeTokenFile(paths.tokenFile, record);
  assert.equal(fs.statSync(paths.tokenFile).mode & 0o777, 0o600);
  assert.deepEqual(resolveRefreshToken(paths, {}).record, record);
});

test("a malformed token file degrades to no source instead of throwing", () => {
  const dir = tmpDir();
  const paths = credentialPaths(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(paths.tokenFile, "{not json", { mode: 0o600 });
  const resolved = resolveRefreshToken(paths, {});
  assert.equal(resolved.source, "none");
  assert.equal(resolved.refreshToken, undefined);
});
