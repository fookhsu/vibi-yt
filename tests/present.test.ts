import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { deliverContent, emptyFields, mergeFields } from "../lib/present.ts";
import { PREVIEW_WINDOW_CHARS } from "../lib/output.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vibi-present-"));
}

test("emptyFields is not truncated and has an empty spill list", () => {
  assert.deepEqual(emptyFields(), { truncated: false, spilled: [] });
});

test("compact short content is not lossy and previews whole", () => {
  const delivery = deliverContent({
    fullText: "short description",
    detail: "compact",
    artifactsDir: tmpDir(),
    spill: { title: "t", videoId: "v", lines: ["{}"] },
  });
  assert.equal(delivery.inlineText, undefined, "compact never inlines");
  assert.equal(delivery.fields.truncated, false);
  assert.equal(delivery.fields.preview, "short description");
  assert.deepEqual(delivery.fields.spilled, []);
});

test("compact long content sets truncated true even though nothing was spilled", () => {
  const fullText = "x".repeat(PREVIEW_WINDOW_CHARS * 3);
  const delivery = deliverContent({
    fullText,
    detail: "compact",
    artifactsDir: tmpDir(),
    spill: { title: "t", videoId: "v", lines: ["{}"] },
  });
  assert.equal(delivery.fields.truncated, true);
  assert.deepEqual(delivery.fields.spilled, [], "compact never spills");
  assert.ok((delivery.fields.preview ?? "").length < fullText.length);
});

test("full short content is inlined and not truncated", () => {
  const delivery = deliverContent({
    fullText: "small",
    detail: "full",
    artifactsDir: tmpDir(),
    spill: { title: "t", videoId: "v", lines: ["{}"] },
  });
  assert.equal(delivery.inlineText, "small");
  assert.equal(delivery.fields.truncated, false);
  assert.deepEqual(delivery.fields.spilled, []);
});

test("full long content spills and is not truncated, because nothing was lost", () => {
  const dir = tmpDir();
  const fullText = "y".repeat(9_000);
  const delivery = deliverContent({
    fullText,
    detail: "full",
    artifactsDir: dir,
    spill: { title: "Big Video", videoId: "abc", lines: ['{"start":0,"dur":1,"text":"y"}'] },
  });
  assert.equal(delivery.inlineText, undefined);
  assert.equal(delivery.fields.truncated, false);
  assert.equal(delivery.fields.spilled.length, 1);
  assert.ok(fs.existsSync(delivery.fields.spilled[0]!.path));
});

test("a failed spill degrades to truncated", () => {
  const fullText = "z".repeat(9_000);
  const delivery = deliverContent({
    fullText,
    detail: "full",
    artifactsDir: "/definitely/not/a/real/vibi/dir",
    spill: { title: "t", videoId: "v", lines: ["{}"] },
  });
  assert.equal(delivery.fields.truncated, true);
  assert.deepEqual(delivery.fields.spilled, []);
  assert.ok((delivery.fields.preview ?? "").length > 0);
});

test("the spill threshold is judged on the full text, not the preview", () => {
  const justUnder = "a".repeat(7_999);
  const under = deliverContent({
    fullText: justUnder,
    detail: "full",
    artifactsDir: tmpDir(),
    spill: { title: "t", videoId: "v", lines: ["{}"] },
  });
  assert.equal(under.inlineText, justUnder);
  assert.deepEqual(under.fields.spilled, []);
});

test("empty content has no preview and no truncation", () => {
  const delivery = deliverContent({
    fullText: "",
    detail: "compact",
    artifactsDir: tmpDir(),
    spill: undefined,
  });
  assert.equal(delivery.fields.truncated, false);
  assert.equal(delivery.fields.preview, undefined);
});

test("mergeFields concatenates spills and keeps a boolean truncated", () => {
  const merged = mergeFields(
    { truncated: true, spilled: [], preview: "a" },
    { truncated: false, spilled: [{ path: "/p", title: "t", bytes: 1, lines: 1 }], records: 2 },
    { truncated: false, spilled: [] },
  );
  assert.equal(merged.truncated, true);
  assert.equal(merged.spilled.length, 1);
  assert.equal(merged.records, 2);
  assert.equal(merged.preview, "a");
});
