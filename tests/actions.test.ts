import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { vibiActions } from "../lib/actions.ts";
import { credentialPaths, resolveApiKey, writeTokenFile } from "../lib/credentials.ts";
import type { ActionContext, FetchLike } from "../tools/types.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vibi-actions-"));
}

const authorize = vibiActions.find((a) => a.name === "authorize")!;
const deauthorize = vibiActions.find((a) => a.name === "deauthorize")!;
const status = vibiActions.find((a) => a.name === "status")!;
const setApiKey = vibiActions.find((a) => a.name === "set-api-key")!;
const clearApiKey = vibiActions.find((a) => a.name === "clear-api-key")!;

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

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitFor<T>(read: () => T | undefined, timeoutMs = 2_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for value");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("set-api-key stores the key and never echoes it", async () => {
  const dir = tmpDir();
  const context: ActionContext = {
    agentDir: dir,
    prompt: async () => "  SECRETKEY123  ",
  };
  const result = await setApiKey.run(context);
  assert.equal(result.ok, true);
  assert.ok(!result.text.includes("SECRETKEY123"), "the key must not appear in the action text");
  assert.equal(resolveApiKey(credentialPaths(dir), {}).apiKey, "SECRETKEY123");
});

test("set-api-key does not store an empty value", async () => {
  const dir = tmpDir();
  const result = await setApiKey.run({ agentDir: dir, prompt: async () => "   " });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(credentialPaths(dir).apiKeyFile), false);
});

test("clear-api-key removes the stored key and leaves the env var alone", async () => {
  const dir = tmpDir();
  await setApiKey.run({ agentDir: dir, prompt: async () => "K" });
  await withEnv({ YOUTUBE_API_KEY: "ENVKEY" }, async () => {
    const result = await clearApiKey.run({ agentDir: dir });
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(credentialPaths(dir).apiKeyFile), false);
    assert.equal(resolveApiKey(credentialPaths(dir), process.env).apiKey, "ENVKEY");
  });
});

test("status reports sources without revealing any value", async () => {
  const dir = tmpDir();
  writeTokenFile(credentialPaths(dir).tokenFile, {
    client_id: "cid",
    refresh_token: "SECRETREFRESH",
    access_token: "SECRETACCESS",
    expires_at: Date.now() + 3_600_000,
    obtained_at: new Date().toISOString(),
  });

  await withEnv({ YOUTUBE_API_KEY: "SECRETAPIKEY" }, async () => {
    const result = await status.run({ agentDir: dir });
    assert.equal(result.ok, true);
    for (const secret of ["SECRETREFRESH", "SECRETACCESS", "SECRETAPIKEY"]) {
      assert.ok(!result.text.includes(secret), `status must not reveal ${secret}`);
    }
    assert.match(result.text, /environment variable/);
    assert.match(result.text, /authorized/);
    assert.match(result.text, /Testing/);
    assert.equal(result.state?.subscriptionsAvailable, true);
  });
});

test("deauthorize revokes at Google first and then deletes the local token", async () => {
  const dir = tmpDir();
  writeTokenFile(credentialPaths(dir).tokenFile, {
    client_id: "cid",
    refresh_token: "REFRESH",
    expires_at: Date.now(),
    obtained_at: new Date().toISOString(),
  });

  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn: FetchLike = async (input, init) => {
    calls.push({ url: String(input), body: init?.body });
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const result = await deauthorize.run({ agentDir: dir, fetchFn });
  assert.equal(result.ok, true);
  assert.equal(calls[0]?.url, "https://oauth2.googleapis.com/revoke");
  assert.match(calls[0]?.body ?? "", /token=REFRESH/);
  assert.equal(fs.existsSync(credentialPaths(dir).tokenFile), false);
});

test("deauthorize counts an already-gone token (400) as success", async () => {
  const dir = tmpDir();
  writeTokenFile(credentialPaths(dir).tokenFile, {
    client_id: "cid",
    refresh_token: "REFRESH",
    expires_at: Date.now(),
    obtained_at: new Date().toISOString(),
  });
  const fetchFn: FetchLike = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_token" }) });
  const result = await deauthorize.run({ agentDir: dir, fetchFn });
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(credentialPaths(dir).tokenFile), false);
});

test("deauthorize still deletes local credentials when the revoke request fails", async () => {
  const dir = tmpDir();
  writeTokenFile(credentialPaths(dir).tokenFile, {
    client_id: "cid",
    refresh_token: "REFRESH",
    expires_at: Date.now(),
    obtained_at: new Date().toISOString(),
  });
  const fetchFn: FetchLike = async () => {
    throw new TypeError("fetch failed");
  };
  const result = await deauthorize.run({ agentDir: dir, fetchFn });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(credentialPaths(dir).tokenFile), false);
});

test("authorize runs the loopback flow, writes a token, and puts the URL in the text", async () => {
  const dir = tmpDir();
  const clientFile = path.join(dir, "client.json");
  fs.writeFileSync(
    clientFile,
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
  const port = await freePort();
  const redirectUri = `http://localhost:${port}`;

  await withEnv(
    { YOUTUBE_OAUTH_CLIENT_JSON: clientFile, YOUTUBE_OAUTH_REDIRECT_URI: redirectUri },
    async () => {
      let authUrl: string | undefined;
      const fetchFn: FetchLike = async (input, init) => {
        assert.equal(String(input), "https://oauth2.googleapis.com/token");
        const form = new URLSearchParams(init?.body);
        assert.equal(form.get("client_secret"), "shh");
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "ACCESS", refresh_token: "REFRESH", expires_in: 3600 }),
        };
      };

      const pending = authorize.run({
        agentDir: dir,
        fetchFn,
        openBrowser: () => {},
        onUrl: (url) => {
          authUrl = url;
        },
      });

      const url = new URL(await waitFor(() => authUrl));
      const state = url.searchParams.get("state")!;
      assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
      await fetch(`${redirectUri}/?code=THECODE&state=${state}`);

      const result = await pending;
      assert.equal(result.ok, true);
      assert.ok(result.text.includes(url.origin + url.pathname));
      assert.match(result.text, /Testing/);

      const persisted = JSON.parse(fs.readFileSync(credentialPaths(dir).tokenFile, "utf8"));
      assert.equal(persisted.refresh_token, "REFRESH");
      assert.equal(persisted.access_token, "ACCESS");
    },
  );
});

test("authorize reports denied consent from the callback", async () => {
  const dir = tmpDir();
  const clientFile = path.join(dir, "client.json");
  fs.writeFileSync(
    clientFile,
    JSON.stringify({
      installed: {
        client_id: "cid",
        client_secret: "shh",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
      },
    }),
  );

  await withEnv(
    { YOUTUBE_OAUTH_CLIENT_JSON: clientFile, YOUTUBE_OAUTH_REDIRECT_URI: undefined },
    async () => {
      let authUrl: string | undefined;
      const pending = authorize.run({
        agentDir: dir,
        openBrowser: () => {},
        onUrl: (url) => {
          authUrl = url;
        },
      });

      const url = new URL(await waitFor(() => authUrl));
      const state = url.searchParams.get("state")!;
      const redirectUri = url.searchParams.get("redirect_uri")!;
      await fetch(`${redirectUri}/?error=access_denied&state=${state}`);

      const result = await pending;
      assert.equal(result.ok, false);
      assert.equal(result.error?.code, "authorization_denied");
      assert.equal(fs.existsSync(credentialPaths(dir).tokenFile), false);
    },
  );
});

test("authorize fails cleanly when the client JSON is missing", async () => {
  const dir = tmpDir();
  await withEnv(
    { YOUTUBE_OAUTH_CLIENT_JSON: path.join(dir, "nope.json") },
    async () => {
      const result = await authorize.run({ agentDir: dir, openBrowser: () => {} });
      assert.equal(result.ok, false);
      assert.equal(result.error?.code, "client_config_invalid");
    },
  );
});
