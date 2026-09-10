/**
 * The seam contracts (ADR 0002).
 *
 * Two seams — `Tool` for the model, `Action` for the user — both declared by
 * core. Core returns structured `data` plus render fields and never
 * model-facing text: rendering is the host's job.
 *
 * Nothing in `tools/` or `lib/` may import an agent SDK (`@earendil-works/*`),
 * or any package that imports one. The parameter schema is authored with
 * TypeBox because its runtime output *is* JSON Schema.
 */

import type { TSchema } from "typebox";

/** Detail axis: `compact` previews only and never spills; `full` spills past the threshold. */
export type Detail = "compact" | "full";

/** A JSONL artifact holding content that was too long to hand over inline. */
export interface SpillInfo {
  /** Absolute path to the JSONL file. */
  path: string;
  /** Human-recognisable title the file was named after. */
  title: string;
  bytes: number;
  lines: number;
}

/**
 * Facts about what happened. The host must render these faithfully; it may
 * choose the wording, but it must not lose `truncated` or `spilled`.
 */
export interface RenderFields {
  /**
   * True when the model did not receive the whole content: `compact` clipped,
   * or a spill failed. False when nothing was lost — including a successful
   * spill, whose full text is on disk with a pointer.
   */
  truncated: boolean;
  /** Always present; empty means nothing spilled. */
  spilled: SpillInfo[];
  /** Opening and closing windows of the full text, for compact results and spills. */
  preview?: string;
  /** How many primary records the result carries. */
  records?: number;
}

/** Failure labels for the tool seam. */
export type ToolFailureCode =
  | "not_authorized"
  | "quota_exceeded"
  | "not_found"
  | "transcript_unavailable"
  | "invalid_input"
  | "network_or_upstream_error"
  | "unknown_tool";

/** Failure labels for the action seam. */
export type ActionFailureCode =
  | "authorization_denied"
  | "redirect_uri_mismatch"
  | "client_config_invalid"
  | "port_in_use"
  | "service_disabled"
  | "authorization_timeout";

/** The closed set of failure labels, shared by both seams. */
export type FailureCode = ToolFailureCode | ActionFailureCode;

/** A machine-readable failure: what went wrong, what to do, whether retrying can help. */
export interface Failure {
  code: FailureCode;
  hint: string;
  retryable: boolean;
}

/**
 * The two files core owns under the agent directory, plus the environment
 * sources that can override them.
 */
export interface CredentialPaths {
  /** `YOUTUBE_OAUTH_CLIENT_JSON` → `<agentDir>/vibi-oauth-client.json` */
  clientJson: string;
  /** `YOUTUBE_OAUTH_REFRESH_TOKEN` → `<agentDir>/vibi-oauth-token.json` */
  tokenFile: string;
  /** `YOUTUBE_API_KEY` → `<agentDir>/vibi-auth.json` */
  apiKeyFile: string;
}

/** Where a credential came from. Never carries a value. */
export type ApiKeySource = "environment" | "stored" | "none";
export type OAuthSource = "environment" | "token_file" | "none";

/** Machine-readable authorization state, returned by the `status` action. */
export interface AuthState {
  apiKeySource: ApiKeySource;
  oauthSource: OAuthSource;
  authorized: boolean;
  /** `undefined` when there is no access token to judge. */
  accessTokenValid?: boolean;
  /** ISO timestamp; derived locally from Google's `expires_in`. */
  accessTokenExpiresAt?: string;
  subscriptionsAvailable: boolean;
  client?: {
    projectId?: string;
    type: "web" | "installed";
    redirectUri: string;
  };
}

/** What a tool handler receives from the host. */
export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** The minimal transport core needs. `fetch` satisfies it. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<HttpResponseLike>;

/** Injectable caption transport, for tests and alternate fetchers. */
export type TranscriptFetcherLike = (
  videoId: string,
  options: { lang?: string },
) => Promise<Array<{ offset: number; duration: number; text: string }>>;

export interface ToolContext {
  /** Directory that holds vibi's credential files (Pi: `getAgentDir()`). */
  agentDir: string;
  /** Directory for spilled artifacts. Core never invents a host's convention. */
  artifactsDir?: string;
  /** Cancellation from the host, when it supports one. */
  signal?: AbortSignal;
  /** Injectable transport, for tests and for a host that owns its HTTP client. */
  fetchFn?: FetchLike;
  /** Injectable caption fetcher; defaults to the YouTube transcript provider. */
  transcriptFetcher?: TranscriptFetcherLike;
}

export type ToolResult<Data> =
  | { ok: true; data: Data; fields: RenderFields }
  | { ok: false; error: Failure; fields: RenderFields };

export interface Tool<Input, Data> {
  name: string;
  description: string;
  /** One-line entry for the host's "available tools" section. */
  promptSnippet?: string;
  /** Guidance bullets; each must name the tool it refers to. */
  promptGuidelines?: string[];
  /** JSON Schema (TypeBox output). */
  parameters: TSchema;
  execute(input: Input, context: ToolContext): Promise<ToolResult<Data>>;
}

/** Presentation ports a host may offer. Core's behaviour never depends on them. */
export interface ActionContext {
  agentDir: string;
  /** Present an authorization URL to a user who has a UI. */
  onUrl?(url: string): void;
  notify?(text: string, level?: "info" | "warn" | "error"): void;
  /** Ask the user for text; `undefined` means they cancelled. */
  prompt?(question: string): Promise<string | undefined>;
  /** Override the system browser opener (tests, or a host that has its own). */
  openBrowser?(url: string): void;
  signal?: AbortSignal;
  fetchFn?: FetchLike;
}

export interface ActionResult {
  /** Always carries the authorization URL for `authorize`, even without a UI. */
  text: string;
  ok: boolean;
  error?: Failure;
  state?: AuthState;
}

export interface Action {
  name: string;
  description: string;
  run(context: ActionContext): Promise<ActionResult>;
}
