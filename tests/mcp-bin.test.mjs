import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const binPath = fileURLToPath(new URL("../bin/mcp.mjs", import.meta.url));

function runServer(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP server timed out. stderr: ${stderr}`));
    }, 15_000);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`MCP server exited ${code}. stderr: ${stderr}`));
      else resolve({ stdout, stderr });
    });

    for (const message of messages) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    child.stdin.end();
  });
}

test("bin/mcp.mjs speaks MCP over stdio", async () => {
  const { stdout } = await runServer([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);

  const responses = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.deepEqual(responses.map((response) => response.id), [1, 2]);
  assert.equal(responses[0].result.serverInfo.name, "vibi");
  assert.ok(Array.isArray(responses[1].result.tools));
  assert.equal(responses[1].result.tools.length, 3);
});
