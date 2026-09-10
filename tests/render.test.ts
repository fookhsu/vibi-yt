import { test } from "node:test";
import assert from "node:assert/strict";

import { renderFieldsBlock, renderResultText } from "../adapters/pi/render.ts";

test("a success renders the data plus the render-field facts", () => {
  const text = renderResultText({
    ok: true,
    data: { query: "cats", results: [] },
    fields: { truncated: false, spilled: [], records: 0 },
  });
  assert.match(text, /"query": "cats"/);
  assert.match(text, /truncated: false/);
  assert.match(text, /records: 0/);
});

test("a failure renders the closed-set code, the hint, and retryability", () => {
  const text = renderResultText({
    ok: false,
    error: { code: "quota_exceeded", hint: "Quota resets at midnight Pacific.", retryable: false },
    fields: { truncated: false, spilled: [] },
  });
  assert.match(text, /FAILED quota_exceeded/);
  assert.match(text, /Quota resets at midnight Pacific\./);
  assert.match(text, /retryable: no/);
});

test("the Pi adapter adds the Pi command for host-remedied failures", () => {
  const text = renderResultText({
    ok: false,
    error: { code: "not_authorized", hint: "This needs authorization.", retryable: true },
    fields: { truncated: false, spilled: [] },
  });
  assert.match(text, /\/youtube:authorize/);
});

test("truncation and spills are always present in the rendered text", () => {
  const text = renderResultText({
    ok: true,
    data: { transcripts: {} },
    fields: {
      truncated: false,
      spilled: [{ path: "/tmp/Big-abc.jsonl", title: "Big", bytes: 10, lines: 2 }],
      preview: "head…tail",
    },
  });
  assert.match(text, /spilled: \/tmp\/Big-abc\.jsonl \(10 bytes, 2 lines\)/);
  assert.match(text, /preview:/);
  assert.match(text, /truncated: false/);
});

test("renderFieldsBlock keeps truncated a boolean even when there is no spill", () => {
  assert.equal(renderFieldsBlock({ truncated: true, spilled: [] }), "truncated: true");
});
