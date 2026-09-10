import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthUrl,
  classifyOAuthError,
  createPkce,
  parseCallbackUrl,
  parsePastedCallback,
  revokeToken,
  exchangeAuthorizationCode,
} from "../lib/oauth-flow.ts";
import type { FetchLike } from "../tools/types.ts";

const CLIENT = {
  type: "web" as const,
  clientId: "cid.apps.googleusercontent.com",
  clientSecret: "shh",
  authUri: "https://accounts.google.com/o/oauth2/auth",
  tokenUri: "https://oauth2.googleapis.com/token",
  projectId: "proj",
};

test("createPkce produces an S256 challenge of the verifier and a state", () => {
  const pkce = createPkce();
  assert.ok(pkce.verifier.length >= 43);
  assert.ok(pkce.challenge.length > 0);
  assert.ok(!pkce.challenge.includes("="), "base64url must not pad");
  assert.ok(pkce.state.length > 0);
});

test("buildAuthUrl carries scope, offline access, PKCE and state", () => {
  const url = new URL(
    buildAuthUrl({
      client: CLIENT,
      redirectUri: "http://localhost:6969",
      state: "STATE",
      challenge: "CHALLENGE",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/auth");
  assert.equal(url.searchParams.get("client_id"), CLIENT.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:6969");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/youtube.readonly");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("include_granted_scopes"), "true");
  assert.equal(url.searchParams.get("state"), "STATE");
  assert.equal(url.searchParams.get("code_challenge"), "CHALLENGE");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("parseCallbackUrl accepts a matching code and rejects a state mismatch", () => {
  const ok = parseCallbackUrl("http://localhost:6969/?code=XYZ&state=STATE", {
    state: "STATE",
    redirectUri: "http://localhost:6969",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.code, "XYZ");

  const mismatch = parseCallbackUrl("http://localhost:6969/?code=XYZ&state=OTHER", {
    state: "STATE",
    redirectUri: "http://localhost:6969",
  });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.ok === false && mismatch.error.hint.length > 0);
});

test("parseCallbackUrl maps error=access_denied", () => {
  const denied = parseCallbackUrl(
    "http://localhost:6969/?error=access_denied&state=STATE",
    { state: "STATE", redirectUri: "http://localhost:6969" },
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.ok === false && denied.error.code, "authorization_denied");
});

test("parsePastedCallback accepts a full URL or a bare code", () => {
  const fromUrl = parsePastedCallback("http://localhost:6969/?code=ABC&state=STATE", {
    state: "STATE",
  });
  assert.equal(fromUrl.ok && fromUrl.code, "ABC");

  const bare = parsePastedCallback("  ABC123  ", { state: "STATE" });
  assert.equal(bare.ok && bare.code, "ABC123");
});

test("parsePastedCallback rejects empty input", () => {
  const empty = parsePastedCallback("   ", { state: "STATE" });
  assert.equal(empty.ok, false);
});

test("classifyOAuthError maps Google's string error field", () => {
  assert.equal(classifyOAuthError(400, { error: "invalid_grant" }).code, "not_authorized");
  assert.equal(classifyOAuthError(401, { error: "invalid_client" }).code, "client_config_invalid");
  assert.equal(
    classifyOAuthError(400, { error: "redirect_uri_mismatch" }).code,
    "redirect_uri_mismatch",
  );
  assert.equal(
    classifyOAuthError(400, {
      error: "invalid_request",
      error_description: "client_secret is missing.",
    }).code,
    "client_config_invalid",
  );
  assert.equal(classifyOAuthError(503, {}).code, "network_or_upstream_error");
});

function fakeFetch(
  handler: (url: string, init?: { headers?: Record<string, string> }) => {
    status: number;
    body: unknown;
  },
): { fetchFn: FetchLike; calls: Array<{ url: string; body: string | undefined; headers?: Record<string, string> }> } {
  const calls: Array<{ url: string; body: string | undefined; headers?: Record<string, string> }> = [];
  const fetchFn: FetchLike = async (input, init) => {
    calls.push({ url: input, body: (init as { body?: string } | undefined)?.body, headers: init?.headers });
    const { status, body } = handler(input, init);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchFn, calls };
}

test("exchangeAuthorizationCode sends client_secret and the PKCE verifier", async () => {
  const { fetchFn, calls } = fakeFetch(() => ({
    status: 200,
    body: { access_token: "a", refresh_token: "r", expires_in: 3600, scope: "youtube.readonly" },
  }));

  const result = await exchangeAuthorizationCode({
    client: CLIENT,
    redirectUri: "http://localhost:6969",
    code: "CODE",
    verifier: "VERIFIER",
    fetchFn,
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0]!.url, CLIENT.tokenUri);
  const form = new URLSearchParams(calls[0]!.body);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code"), "CODE");
  assert.equal(form.get("client_secret"), "shh");
  assert.equal(form.get("code_verifier"), "VERIFIER");
  assert.equal(form.get("redirect_uri"), "http://localhost:6969");
});

test("exchangeAuthorizationCode surfaces a missing client_secret as client_config_invalid", async () => {
  const { fetchFn } = fakeFetch(() => ({
    status: 400,
    body: { error: "invalid_request", error_description: "client_secret is missing." },
  }));
  const result = await exchangeAuthorizationCode({
    client: CLIENT,
    redirectUri: "http://localhost:6969",
    code: "CODE",
    verifier: "V",
    fetchFn,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "client_config_invalid");
});

test("revokeToken treats 200 and 400 as success and only reports transport failures", async () => {
  const ok = await revokeToken({
    token: "T",
    fetchFn: fakeFetch(() => ({ status: 200, body: {} })).fetchFn,
  });
  assert.equal(ok.ok, true);

  const alreadyGone = await revokeToken({
    token: "T",
    fetchFn: fakeFetch(() => ({ status: 400, body: { error: "invalid_token" } })).fetchFn,
  });
  assert.equal(alreadyGone.ok, true);

  const network: FetchLike = async () => {
    throw new TypeError("fetch failed");
  };
  const failed = await revokeToken({ token: "T", fetchFn: network });
  assert.equal(failed.ok, false);
  assert.equal(failed.ok === false && failed.error.code, "network_or_upstream_error");
});
