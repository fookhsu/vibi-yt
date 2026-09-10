import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { createMcpServer, MCP_PROTOCOL_VERSION } = await import("../adapters/mcp/server.ts");
const { runStdioServer, handleStdioLine } = await import("../adapters/mcp/stdio.ts");

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const server = createMcpServer();

test("initialize advertises tools capability and server info", async () => {
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: MCP_PROTOCOL_VERSION, clientInfo: { name: "test", version: "1.0.0" } },
  });

  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
  assert.equal(response.result.serverInfo.name, "vibi");
  assert.equal(
    response.result.serverInfo.version,
    packageJson.version,
    "serverInfo.version must match package.json",
  );
});

test("initialize falls back to the latest supported protocol version", async () => {
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "initialize",
    params: { protocolVersion: "1999-01-01" },
  });
  assert.equal(response.result.protocolVersion, MCP_PROTOCOL_VERSION);
});

test("notifications produce no response", async () => {
  const response = await server.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(response, null);
});

test("ping returns an empty result", async () => {
  const response = await server.handleMessage({ jsonrpc: "2.0", id: 3, method: "ping" });
  assert.deepEqual(response.result, {});
});

test("tools/list exposes JSON Schema input schemas", async () => {
  const response = await server.handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" });
  const tools = response.result.tools;

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["youtube_search", "youtube_video_details", "youtube_transcript"],
  );
  const search = tools.find((tool) => tool.name === "youtube_search");
  assert.equal(search.inputSchema.type, "object");
  assert.ok(search.inputSchema.properties.query);
});

test("tools/call maps failure outcomes to isError content", async () => {
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "youtube_video_details", arguments: {} },
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /Provide videoId or videoIds/);
  assert.equal(response.result.structuredContent.error, "missing_input");
});

test("tools/call rejects unknown tools with invalid params", async () => {
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "youtube_nope", arguments: {} },
  });
  assert.equal(response.error.code, -32602);
});

test("unknown methods return method not found", async () => {
  const response = await server.handleMessage({ jsonrpc: "2.0", id: 7, method: "resources/list" });
  assert.equal(response.error.code, -32601);
});

test("invalid requests are rejected", async () => {
  const response = await server.handleMessage({ jsonrpc: "2.0", id: 8 });
  assert.equal(response.error.code, -32600);
});

test("batch requests return an array of responses", async () => {
  const response = await server.handleMessage([
    { jsonrpc: "2.0", id: 9, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" },
  ]);
  assert.ok(Array.isArray(response));
  assert.equal(response.length, 1);
  assert.equal(response[0].id, 9);
});

test("stdio transport writes newline-delimited responses and reports parse errors", async () => {
  const chunks = [];
  const output = { write: (chunk) => chunks.push(chunk) };

  await handleStdioLine(server, "not json", output);
  await handleStdioLine(server, JSON.stringify({ jsonrpc: "2.0", id: 10, method: "ping" }), output);
  await handleStdioLine(server, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), output);

  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.endsWith("\n")));

  const [parseError, ping] = chunks.map((chunk) => JSON.parse(chunk));
  assert.equal(parseError.error.code, -32700);
  assert.equal(ping.id, 10);
});

test("runStdioServer consumes a stream of chunks", async () => {
  const encoder = new TextEncoder();
  const input = (async function* () {
    yield encoder.encode('{"jsonrpc":"2.0","id":11,"method":"tools/list"}\n{"jsonrpc":');
    yield encoder.encode('"2.0","id":12,"method":"ping"}\n');
  })();
  const chunks = [];

  await runStdioServer(server, { input, output: { write: (chunk) => chunks.push(chunk) } });

  const responses = chunks.map((chunk) => JSON.parse(chunk));
  assert.deepEqual(responses.map((response) => response.id), [11, 12]);
});
