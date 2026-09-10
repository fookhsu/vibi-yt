#!/usr/bin/env node
/**
 * MCP stdio entrypoint.
 *
 * Usage (Claude Code, Cursor, Codex, ...):
 *   {
 *     "mcpServers": {
 *       "youtube": {
 *         "command": "npx",
 *         "args": ["-y", "vibi-yt", "mcp"],
 *         "env": { "YOUTUBE_API_KEY": "..." }
 *       }
 *     }
 *   }
 *
 * Runs on the compiled output in `dist/`, so plain Node.js works with no
 * TypeScript loader. Run `npm run build` after changing sources.
 */
import { createMcpServer } from "../dist/adapters/mcp/server.js";
import { runStdioServer } from "../dist/adapters/mcp/stdio.js";

try {
  await runStdioServer(createMcpServer());
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`vibi MCP server failed: ${message}\n`);
  process.exitCode = 1;
}
