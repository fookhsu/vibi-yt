import assert from "node:assert/strict";
import test from "node:test";

const { youtubeTools, findYoutubeTool, executeYoutubeTool, toJsonSchema } = await import("../tools/index.ts");
const { registerYoutubeTools } = await import("../adapters/pi/tools.ts");

test("core exposes the three YouTube tools", () => {
  assert.deepEqual(
    youtubeTools.map((tool) => tool.name),
    ["youtube_search", "youtube_video_details", "youtube_transcript"],
  );
  for (const tool of youtubeTools) {
    assert.equal(typeof tool.execute, "function");
    assert.equal(typeof tool.description, "string");
    assert.ok(tool.promptSnippet, `${tool.name} should declare a promptSnippet`);
  }
});

test("core parameters are plain JSON Schema (no agent SDK types)", () => {
  for (const tool of youtubeTools) {
    assert.equal(tool.parameters.type, "object");
    const roundTripped = toJsonSchema(tool.parameters);
    assert.deepEqual(roundTripped, JSON.parse(JSON.stringify(tool.parameters)));
    assert.ok(roundTripped.properties, `${tool.name} should expose properties`);
    assert.ok(!Object.getOwnPropertySymbols(roundTripped).length);
  }
});

test("findYoutubeTool resolves by name", () => {
  assert.ok(findYoutubeTool("youtube_search"));
  assert.equal(findYoutubeTool("nope"), undefined);
});

test("executeYoutubeTool reports unknown tools as errors", async () => {
  const outcome = await executeYoutubeTool("youtube_missing", {});
  assert.equal(outcome.isError, true);
  assert.match(outcome.text, /Unknown YouTube tool/);
  assert.equal(outcome.data?.error, "unknown_tool");
});

test("executeYoutubeTool flags missing video input without touching the network", async () => {
  const outcome = await executeYoutubeTool("youtube_video_details", {});
  assert.equal(outcome.isError, true);
  assert.match(outcome.text, /Provide videoId or videoIds/);
  assert.equal(outcome.data?.error, "missing_input");
});

test("pi adapter registers every core tool and forwards details", async () => {
  const registered = [];
  const pi = {
    registerTool(definition) {
      registered.push(definition);
    },
  };

  registerYoutubeTools(pi);

  assert.deepEqual(
    registered.map((tool) => tool.name),
    ["youtube_search", "youtube_video_details", "youtube_transcript"],
  );
  assert.equal(registered[0].label, "YouTube Search");
  assert.equal(registered[0].parameters, findYoutubeTool("youtube_search").parameters);

  const result = await registered[1].execute("call-1", {});
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /Provide videoId or videoIds/);
  assert.equal(result.details.error, "missing_input");
});
