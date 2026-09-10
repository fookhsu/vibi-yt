import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PREVIEW_WINDOW_CHARS,
  SPILL_THRESHOLD_CHARS,
  isLossy,
  previewOf,
  sanitizeFileName,
  spillUnits,
} from "../lib/output.ts";

test("short text is not lossy and previews as itself", () => {
  const text = "hello world";
  assert.equal(isLossy(text), false);
  assert.equal(previewOf(text), text);
});

test("text longer than two windows is lossy and previews as opening + closing", () => {
  const head = "H".repeat(PREVIEW_WINDOW_CHARS);
  const middle = "M".repeat(100);
  const tail = "T".repeat(PREVIEW_WINDOW_CHARS);
  const text = head + middle + tail;

  assert.equal(isLossy(text), true);
  const preview = previewOf(text);
  assert.ok(preview.startsWith(head));
  assert.ok(preview.endsWith(tail));
  assert.ok(!preview.includes(middle), "the middle must not appear in the preview");
  assert.ok(preview.length < text.length);
});

test("the spill threshold is 8,000 characters and preview windows are 2,000", () => {
  assert.equal(SPILL_THRESHOLD_CHARS, 8_000);
  assert.equal(PREVIEW_WINDOW_CHARS, 2_000);
});

test("sanitizeFileName removes path separators, colons and control characters", () => {
  const name = sanitizeFileName('a/b:c\\d\u0000e\u001f  spaced   title');
  assert.ok(!name.includes("/"));
  assert.ok(!name.includes(":"));
  assert.ok(!name.includes("\\"));
  assert.ok(!/[\u0000-\u001f]/.test(name));
  assert.ok(name.includes("spaced title"));
});

test("sanitizeFileName caps the length", () => {
  const name = sanitizeFileName("x".repeat(500));
  assert.ok(name.length <= 120, `expected <= 120, got ${name.length}`);
});

test("sanitizeFileName never returns an empty name", () => {
  assert.equal(sanitizeFileName("///"), "untitled");
});

test("spillUnits writes JSONL and reports path, title, bytes and lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibi-spill-"));
  const result = spillUnits(
    [
      {
        title: "A/B: Video",
        videoId: "abc123",
        lines: ['{"start":0,"dur":2,"text":"hi"}', '{"start":2,"dur":2,"text":"there"}'],
      },
    ],
    dir,
  );

  assert.equal(result.failed, false);
  assert.equal(result.spilled.length, 1);
  const info = result.spilled[0]!;
  assert.equal(info.title, "A/B: Video");
  assert.equal(info.lines, 2);
  assert.ok(info.bytes > 0);
  assert.ok(fs.existsSync(info.path));
  assert.ok(path.basename(info.path).endsWith("-abc123.jsonl"));
  const content = fs.readFileSync(info.path, "utf8");
  assert.equal(content.trimEnd().split("\n").length, 2);
});

test("spillUnits reports a failure instead of throwing when the directory is not writable", () => {
  const result = spillUnits(
    [{ title: "x", videoId: "y", lines: ["{}"] }],
    "/definitely/not/a/real/directory/for/vibi",
  );
  assert.equal(result.failed, true);
  assert.deepEqual(result.spilled, []);
});
