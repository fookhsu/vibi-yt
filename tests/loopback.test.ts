import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { startLoopbackServer } from "../lib/oauth-flow.ts";

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

test("a fixed loopback server accepts the matching callback", async () => {
  const port = await freePort();
  const redirectUri = `http://localhost:${port}`;
  const started = await startLoopbackServer({ redirectUri, state: "STATE", timeoutMs: 2_000 });
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.server.redirectUri, redirectUri);

  const pending = started.server.waitForCallback();
  const response = await fetch(`${redirectUri}/?code=ABC&state=STATE`);
  assert.equal(response.status, 200);

  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.code, "ABC");
});

test("a fixed loopback server reports a state mismatch", async () => {
  const port = await freePort();
  const redirectUri = `http://localhost:${port}`;
  const started = await startLoopbackServer({ redirectUri, state: "STATE", timeoutMs: 2_000 });
  assert.equal(started.ok, true);
  if (!started.ok) return;

  const pending = started.server.waitForCallback();
  await fetch(`${redirectUri}/?code=ABC&state=OTHER`);
  const result = await pending;
  assert.equal(result.ok, false);
});

test("an ephemeral installed loopback server binds a real port and reports denied consent", async () => {
  const started = await startLoopbackServer({ state: "S", timeoutMs: 2_000 });
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.match(started.server.redirectUri, /^http:\/\/127\.0\.0\.1:\d+$/);

  const pending = started.server.waitForCallback();
  await fetch(`${started.server.redirectUri}/?error=access_denied&state=S`);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "authorization_denied");
});

test("a loopback server without a callback times out", async () => {
  const started = await startLoopbackServer({ state: "S", timeoutMs: 40 });
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const result = await started.server.waitForCallback();
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "authorization_timeout");
});

test("a taken fixed port is a port_in_use failure, not a different port", async () => {
  const port = await freePort();
  const redirectUri = `http://localhost:${port}`;
  const first = await startLoopbackServer({ redirectUri, state: "S", timeoutMs: 2_000 });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = await startLoopbackServer({ redirectUri, state: "S", timeoutMs: 2_000 });
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.error.code, "port_in_use");

  first.server.close();
});
