import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveRedirectUri, parseClientJson } from "../lib/oauth-client.ts";

const WEB_CLIENT = {
  web: {
    client_id: "cid.apps.googleusercontent.com",
    client_secret: "shh",
    project_id: "quiet-groove-507809-s9",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
  },
};

const INSTALLED_CLIENT = {
  installed: {
    client_id: "cid.apps.googleusercontent.com",
    client_secret: "shh",
    project_id: "proj",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    redirect_uris: ["http://localhost"],
  },
};

test("parseClientJson reads a web client", () => {
  const result = parseClientJson(WEB_CLIENT);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.client.type, "web");
  assert.equal(result.ok && result.client.projectId, "quiet-groove-507809-s9");
  assert.equal(result.ok && result.client.clientSecret, "shh");
});

test("parseClientJson reads an installed client", () => {
  const result = parseClientJson(INSTALLED_CLIENT);
  assert.equal(result.ok && result.client.type, "installed");
});

test("parseClientJson rejects a payload without a known top-level client key", () => {
  const result = parseClientJson({ something: {} });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "client_config_invalid");
});

test("parseClientJson rejects a client with no client_id", () => {
  const result = parseClientJson({ web: { token_uri: "https://x/token" } });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "client_config_invalid");
});

test("a web client redirect is fixed to the registered value, defaulting to localhost:6969", () => {
  const parsed = parseClientJson(WEB_CLIENT);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const fallback = deriveRedirectUri(parsed.client, {});
  assert.deepEqual(fallback, { kind: "fixed", uri: "http://localhost:6969" });

  const overridden = deriveRedirectUri(parsed.client, {
    YOUTUBE_OAUTH_REDIRECT_URI: "http://localhost:8080",
  });
  assert.deepEqual(overridden, { kind: "fixed", uri: "http://localhost:8080" });
});

test("an installed client gets an ephemeral loopback port", () => {
  const parsed = parseClientJson(INSTALLED_CLIENT);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(deriveRedirectUri(parsed.client, {}), { kind: "ephemeral", host: "127.0.0.1" });
});

test("a non-loopback web redirect is a config error, not a runtime mismatch", () => {
  const parsed = parseClientJson(WEB_CLIENT);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const derived = deriveRedirectUri(parsed.client, {
    YOUTUBE_OAUTH_REDIRECT_URI: "https://example.com/callback",
  });
  assert.equal("error" in derived, true);
  assert.equal("error" in derived && derived.error.code, "client_config_invalid");
});
