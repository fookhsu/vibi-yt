import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import vibi from "../extensions/index.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vibi-adapter-"));
}

interface Captured {
  tools: Map<string, Record<string, unknown>>;
  commands: Map<string, Record<string, unknown>>;
  events: Map<string, (...args: unknown[]) => unknown>;
}

function stubPi(): { pi: ExtensionAPI; captured: Captured } {
  const captured: Captured = { tools: new Map(), commands: new Map(), events: new Map() };
  const pi = {
    registerTool(definition: Record<string, unknown>) {
      captured.tools.set(String(definition["name"]), definition);
    },
    registerCommand(name: string, options: Record<string, unknown>) {
      captured.commands.set(name, options);
    },
    on(name: string, handler: (...args: unknown[]) => unknown) {
      captured.events.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  return { pi, captured };
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

test("the Pi adapter registers the four tools and five commands", () => {
  const { pi, captured } = stubPi();
  vibi(pi);

  assert.deepEqual([...captured.tools.keys()], [
    "youtube_search",
    "youtube_video_details",
    "youtube_transcript",
    "youtube_subscriptions",
  ]);
  assert.deepEqual([...captured.commands.keys()], [
    "youtube:authorize",
    "youtube:deauthorize",
    "youtube:status",
    "youtube:set-api-key",
    "youtube:clear-api-key",
  ]);
  assert.equal(typeof captured.events.get("session_shutdown"), "function");
});

test("every registered tool has a description and a schema", () => {
  const { pi, captured } = stubPi();
  vibi(pi);
  for (const tool of captured.tools.values()) {
    assert.equal(typeof tool["description"], "string");
    assert.ok(tool["parameters"], "parameters must be present");
  }
});

test("a tool maps a core result onto Pi content and details", async () => {
  const dir = tmpDir();
  await withEnv({ PI_CODING_AGENT_DIR: dir, YOUTUBE_API_KEY: undefined }, async () => {
    const { pi, captured } = stubPi();
    vibi(pi);
    const tool = captured.tools.get("youtube_search")!;
    const execute = tool["execute"] as (...args: unknown[]) => Promise<{
      content: Array<{ type: string; text: string }>;
      details: { ok: boolean };
    }>;

    const result = await execute(
      "call-1",
      { query: "x" },
      undefined,
      undefined,
      { cwd: "/tmp/project", hasUI: false },
    );

    assert.match(result.content[0]!.text, /FAILED not_authorized/);
    assert.equal(result.details.ok, false);
  });
});

test("the set-api-key command stores a key without echoing it", async () => {
  const dir = tmpDir();
  await withEnv({ PI_CODING_AGENT_DIR: dir }, async () => {
    const { pi, captured } = stubPi();
    vibi(pi);
    const command = captured.commands.get("youtube:set-api-key")!;
    const handler = command["handler"] as (args: string, ctx: unknown) => Promise<void>;

    const notifications: string[] = [];
    const ctx = {
      hasUI: true,
      cwd: dir,
      ui: {
        notify: (message: string) => notifications.push(message),
        input: async () => "PIKEY",
        confirm: async () => true,
      },
    };

    await handler("", ctx);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "vibi-auth.json"), "utf8"));
    assert.equal(stored.apiKey, "PIKEY");
    assert.ok(notifications.length > 0);
    for (const message of notifications) {
      assert.ok(!message.includes("PIKEY"), "the key must never be echoed");
    }
  });
});
