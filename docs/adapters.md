# Adapters

`vibi` is built as an agent-neutral core plus thin adapters, so the same YouTube behaviour is available to Pi, MCP clients, and any agent that speaks JSON tool calling.

```txt
lib/                     YouTube API, transcript, auth, formatters (pure, no agent SDK)
  │
tools/                   ★ agent-neutral core
  ├─ types.ts            YoutubeToolSpec, ToolOutcome, ToolContext
  ├─ youtube-tools.ts    the three tool specs (JSON Schema + handler)
  └─ index.ts            registry, dispatcher, toJsonSchema()
  │
adapters/
  ├─ pi/                 → pi.registerTool() + /youtube:* commands   (Pi)
  ├─ mcp/                → MCP stdio server (tools/list, tools/call) (Claude Code, Cursor, Codex, ...)
  └─ portable.ts         → OpenAI / Anthropic function-calling JSON  (any agent)
```

The dependency rule points one way: `adapters/` may import `tools/`, `tools/` may import `lib/`, and nothing below `adapters/` may import `@earendil-works/*` or any other agent SDK.

## The core contract

A tool is a plain object. Inputs are validated by a JSON Schema (authored with TypeBox, whose runtime output *is* JSON Schema), and handlers return a transport-neutral outcome.

```ts
import type { TSchema } from "typebox";

export interface ToolOutcome {
  text: string;                     // model-facing text
  data?: Record<string, unknown>; // structured data for rendering / callers
  isError?: boolean;                // true when `text` describes a failure
}

export interface ToolContext {
  signal?: AbortSignal;
}

export interface YoutubeToolSpec<Input = Record<string, unknown>> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;           // host system-prompt "available tools" entry
  promptGuidelines?: string[];      // host guidance bullets (each names its tool)
  parameters: TSchema;              // JSON Schema
  execute(input: Input, context?: ToolContext): Promise<ToolOutcome>;
}
```

Design rules:

- **Handlers never throw for expected failures.** They return `isError: true` so every adapter maps errors consistently.
- **Handlers return text, not SDK content blocks.** Each adapter builds its own `{ type: "text", text }` envelope.
- **No streaming, no host callbacks in the core.** Pi's `onUpdate`, TUI rendering, and slash commands live in `adapters/pi/`.
- **`data` is opaque.** Pi maps it onto its `details` field for rendering and session state; MCP maps it onto `structuredContent`.

## Adapters

### `adapters/pi/tools.ts`

Projects each spec onto `pi.registerTool()`. Pi receives the TypeBox schema directly (no conversion), and error outcomes stay in `content` rather than throwing, matching the extension's original behaviour.

`adapters/pi/index.ts` additionally registers the `/youtube:key`, `/youtube:key:set`, and `/youtube:key:clear` commands, which need Pi's `ctx.ui`.

### `adapters/mcp/server.ts`

A dependency-free MCP server. `createMcpServer()` returns an object with `listTools()` and `handleMessage()`, so the protocol is testable without a process. Supported methods:

| Method | Behaviour |
|---|---|
| `initialize` | Negotiates `protocolVersion`, advertises `tools` |
| `notifications/initialized` | No response |
| `ping` | `{}` |
| `tools/list` | `{ tools: [{ name, description, inputSchema }] }` |
| `tools/call` | `{ content, isError?, structuredContent? }` |

`adapters/mcp/stdio.ts` adds the newline-delimited JSON-RPC transport, and `bin/mcp.mjs` is the executable entrypoint.

### `adapters/portable.ts`

Exports the same definitions in the shapes other agent SDKs expect:

```ts
toToolDefinitions()  // { name, description, parameters }[]
toOpenAiTools()      // { type: "function", function: { ... } }[]
toAnthropicTools()   // { name, description, input_schema }[]
executeYoutubeTool() // shared dispatcher
```

## Adding an adapter

1. Import from `tools/index.ts` — never from `lib/` directly.
2. Map `YoutubeToolSpec.parameters` to your host's schema format. If your host wants JSON Schema, use `toJsonSchema(tool.parameters)` to strip the TypeBox symbol marker.
3. Map `ToolContext` to your host's cancellation primitive when it has one.
4. Map `ToolOutcome` to your host's result shape:
   - text content → your host's text block
   - `isError` → your host's error flag (or throw, if the host has no flag)
   - `data` → your host's structured data field

Skeleton:

```ts
import { youtubeTools, toJsonSchema } from "../tools/index.ts";

export function registerMyAgentTools(host: MyAgent) {
  for (const tool of youtubeTools) {
    host.defineTool({
      name: tool.name,
      description: tool.description,
      inputSchema: toJsonSchema(tool.parameters),
      async run(args, signal) {
        const outcome = await tool.execute(args, { signal });
        return { text: outcome.text, error: outcome.isError === true, meta: outcome.data };
      },
    });
  }
}
```

5. Add a test in `tests/` that drives the adapter with a fake host, and one that calls the real `executeYoutubeTool` for a network-free path (for example, missing input).

Keep the adapter free of domain logic. If you find yourself formatting API responses or resolving the API key, that belongs in `tools/` or `lib/`.
