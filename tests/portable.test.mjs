import assert from "node:assert/strict";
import test from "node:test";

const {
  toToolDefinitions,
  toOpenAiTools,
  toAnthropicTools,
  executeYoutubeTool,
} = await import("../adapters/portable.ts");

test("toToolDefinitions returns neutral name/description/parameters", () => {
  const definitions = toToolDefinitions();
  assert.deepEqual(
    definitions.map((definition) => definition.name),
    ["youtube_search", "youtube_video_details", "youtube_transcript"],
  );
  for (const definition of definitions) {
    assert.equal(definition.parameters.type, "object");
    assert.equal(typeof definition.description, "string");
  }
});

test("toOpenAiTools wraps definitions in function-calling envelopes", () => {
  const tools = toOpenAiTools();
  assert.equal(tools.length, 3);
  for (const tool of tools) {
    assert.equal(tool.type, "function");
    assert.equal(tool.function.parameters.type, "object");
    assert.equal(typeof tool.function.name, "string");
  }
});

test("toAnthropicTools uses input_schema", () => {
  const tools = toAnthropicTools();
  assert.equal(tools.length, 3);
  for (const tool of tools) {
    assert.equal(tool.input_schema.type, "object");
    assert.equal(tool.parameters, undefined);
  }
});

test("portable adapter re-exports the neutral dispatcher", async () => {
  const outcome = await executeYoutubeTool("youtube_video_details", {});
  assert.equal(outcome.isError, true);
});
