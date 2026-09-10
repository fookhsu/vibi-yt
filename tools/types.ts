import type { TSchema } from "typebox";

/**
 * Agent-neutral tool contracts.
 *
 * Nothing in `tools/` may import `@earendil-works/*` or any other agent SDK.
 * The parameter schema is a plain JSON Schema object (TypeBox is used as the
 * authoring helper because its runtime output is JSON Schema), and handlers
 * return a transport-neutral outcome that each adapter maps onto its own
 * result shape.
 */

/** One text block, mirroring the near-universal `{ type: "text", text }` shape. */
export interface ToolTextContent {
  type: "text";
  text: string;
}

/** Transport-neutral tool outcome. Adapters decide how errors are surfaced. */
export interface ToolOutcome {
  /** Model-facing text. */
  text: string;
  /**
   * Structured data produced by the tool (search results, video details,
   * transcripts). Named `data` rather than `details` to avoid colliding with
   * the domain object `VideoDetails`, and rather than `response` because this
   * field is only the structured part of an outcome whose `text` is also part
   * of the response.
   */
  data?: Record<string, unknown>;
  /** True when `text` describes a failure. Pi ignores this; MCP maps it to `isError`. */
  isError?: boolean;
}

export interface ToolContext {
  /** Cancellation signal supplied by the host agent, when it supports one. */
  signal?: AbortSignal;
}

export interface YoutubeToolSpec<Input = Record<string, unknown>> {
  name: string;
  label: string;
  description: string;
  /** One-line entry for the host's system prompt "available tools" section. */
  promptSnippet?: string;
  /** Host-specific guidance bullets. Each bullet must name its tool. */
  promptGuidelines?: string[];
  /** JSON Schema (TypeBox output) describing the tool input. */
  parameters: TSchema;
  execute(input: Input, context?: ToolContext): Promise<ToolOutcome>;
}

/**
 * Erased spec type for heterogeneous registries and adapters.
 *
 * Tool inputs differ per tool, so a registry cannot be typed as
 * `YoutubeToolSpec<Record<string, unknown>>` without every input interface
 * carrying an index signature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyYoutubeToolSpec = YoutubeToolSpec<any>;
