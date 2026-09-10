/**
 * The OAuth state machine (ticket G3): PKCE, the loopback listener, the
 * authorization-code exchange, proactive refresh, and revocation.
 *
 * Core owns all of it. The host only presents a URL; the browser is opened by
 * core itself, because Pi extensions have no browser capability.
 */

import http from "node:http";
import { execFile } from "node:child_process";
import crypto from "node:crypto";

import type { Failure, FetchLike } from "../tools/types.ts";
import { classifyFetchError, failure } from "./failures.ts";
import type { OAuthClient } from "./oauth-client.ts";

export const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const DEFAULT_CALLBACK_TIMEOUT_MS = 120_000;

export interface Pkce {
  verifier: string;
  challenge: string;
  state: string;
}

export function createPkce(): Pkce {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

export interface BuildAuthUrlParams {
  client: OAuthClient;
  redirectUri: string;
  state: string;
  challenge: string;
}

export function buildAuthUrl(params: BuildAuthUrlParams): string {
  const url = new URL(params.client.authUri);
  const query: Record<string, string> = {
    client_id: params.client.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: YOUTUBE_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
  };
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export type CallbackResult = { ok: true; code: string } | { ok: false; error: Failure };

export function parseCallbackUrl(
  urlString: string,
  expected: { state: string; redirectUri: string },
): CallbackResult {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, error: failure("invalid_input", "That is not a callback URL. Paste the full address bar URL.") };
  }

  const error = url.searchParams.get("error");
  if (error) {
    if (error === "access_denied") return { ok: false, error: failure("authorization_denied") };
    if (error === "redirect_uri_mismatch") return { ok: false, error: failure("redirect_uri_mismatch") };
    return {
      ok: false,
      error: failure("authorization_denied", `Google returned error "${error}" before consent finished. Run authorize again.`),
    };
  }

  const state = url.searchParams.get("state");
  if (state !== expected.state) {
    return {
      ok: false,
      error: failure(
        "invalid_input",
        "The callback does not belong to this authorization attempt (state mismatch). Run authorize again.",
      ),
    };
  }

  const code = url.searchParams.get("code");
  if (!code) return { ok: false, error: failure("invalid_input", "The callback has no authorization code.") };
  return { ok: true, code };
}

export function parsePastedCallback(text: string, expected: { state: string }): CallbackResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: failure("authorization_timeout") };
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes("code=")) {
    return parseCallbackUrl(trimmed, { state: expected.state, redirectUri: "" });
  }
  return { ok: true, code: trimmed };
}

interface OAuthErrorBody {
  error?: unknown;
  error_description?: unknown;
}

/** Map an OAuth endpoint error onto the closed set. */
export function classifyOAuthError(_status: number, body: unknown): Failure {
  const record = (body ?? {}) as OAuthErrorBody;
  const code = typeof record.error === "string" ? record.error : "";
  const description = typeof record.error_description === "string" ? record.error_description : "";

  if (code === "invalid_grant") return failure("not_authorized");
  if (code === "invalid_client") return failure("client_config_invalid");
  if (code === "redirect_uri_mismatch") return failure("redirect_uri_mismatch");
  if (code === "access_denied" || code === "authorization_denied") return failure("authorization_denied");
  if (code === "invalid_request" && /client_secret/i.test(description)) {
    return failure("client_config_invalid");
  }
  if (/SERVICE_DISABLED/i.test(code) || /disabled|has not been used/i.test(description)) {
    return failure("service_disabled");
  }
  return failure("network_or_upstream_error");
}

async function requestToken(
  fetchFn: FetchLike,
  tokenUri: string,
  form: Record<string, string>,
): Promise<TokenExchangeResult> {
  let response;
  try {
    response = await fetchFn(tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
  } catch (error) {
    return { ok: false, error: classifyFetchError(error) };
  }

  const body = await response.json().catch(() => undefined);
  if (!response.ok) return { ok: false, error: classifyOAuthError(response.status, body) };
  return { ok: true, tokenResponse: body };
}

export interface ExchangeParams {
  client: OAuthClient;
  redirectUri: string;
  code: string;
  verifier: string;
  fetchFn?: FetchLike;
}

export type TokenExchangeResult =
  | { ok: true; tokenResponse: unknown }
  | { ok: false; error: Failure };

export async function exchangeAuthorizationCode(
  params: ExchangeParams,
): Promise<TokenExchangeResult> {
  const fetchFn: FetchLike = params.fetchFn ?? (fetch as FetchLike);
  const form: Record<string, string> = {
    code: params.code,
    client_id: params.client.clientId,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.verifier,
  };
  // Real-machine finding (ticket T1): Google hard-rejects a missing secret.
  if (params.client.clientSecret) form["client_secret"] = params.client.clientSecret;
  return requestToken(fetchFn, params.client.tokenUri, form);
}

export interface RefreshParams {
  client: OAuthClient;
  refreshToken: string;
  fetchFn?: FetchLike;
}

export async function refreshAccessToken(params: RefreshParams): Promise<TokenExchangeResult> {
  const fetchFn: FetchLike = params.fetchFn ?? (fetch as FetchLike);
  const form: Record<string, string> = {
    client_id: params.client.clientId,
    refresh_token: params.refreshToken,
    grant_type: "refresh_token",
  };
  if (params.client.clientSecret) form["client_secret"] = params.client.clientSecret;
  return requestToken(fetchFn, params.client.tokenUri, form);
}

export async function revokeToken(params: {
  token: string;
  fetchFn?: FetchLike;
}): Promise<{ ok: true } | { ok: false; error: Failure }> {
  const fetchFn: FetchLike = params.fetchFn ?? (fetch as FetchLike);
  let response;
  try {
    response = await fetchFn(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: params.token }).toString(),
    });
  } catch (error) {
    return { ok: false, error: classifyFetchError(error) };
  }
  // 200 = revoked; 400 = already gone. Both mean "no longer authorized".
  if (response.status === 200 || response.status === 400) return { ok: true };
  return { ok: false, error: failure("network_or_upstream_error") };
}

export interface LoopbackServer {
  redirectUri: string;
  waitForCallback(): Promise<CallbackResult>;
  close(): void;
}

let activeLoopback: LoopbackServer | undefined;

/** Close any loopback listener still waiting; used on `session_shutdown`. */
export function closeActiveLoopback(): void {
  const server = activeLoopback;
  activeLoopback = undefined;
  server?.close();
}

export interface StartLoopbackParams {
  /** Exact registered URI for web clients. Omit for an ephemeral installed port. */
  redirectUri?: string;
  ephemeralHost?: string;
  state: string;
  timeoutMs?: number;
}

export async function startLoopbackServer(
  params: StartLoopbackParams,
): Promise<{ ok: true; server: LoopbackServer } | { ok: false; error: Failure }> {
  let settle: (result: CallbackResult) => void = () => {};
  const callback = new Promise<CallbackResult>((resolve) => {
    settle = resolve;
  });

  let settled = false;
  const resolveOnce = (result: CallbackResult) => {
    if (settled) return;
    settled = true;
    settle(result);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (error === "access_denied") {
      res.end("<h2>Authorization denied. You can close this tab.</h2>");
      resolveOnce({ ok: false, error: failure("authorization_denied") });
      return;
    }
    if (error) {
      res.end(`<h2>Authorization failed: ${error}. You can close this tab.</h2>`);
      resolveOnce({
        ok: false,
        error: failure("authorization_denied", `Google returned error "${error}" before consent finished.`),
      });
      return;
    }
    if (state !== params.state) {
      res.end("<h2>State mismatch. You can close this tab.</h2>");
      resolveOnce({
        ok: false,
        error: failure(
          "invalid_input",
          "The callback does not belong to this authorization attempt (state mismatch). Run authorize again.",
        ),
      });
      return;
    }
    if (!code) {
      res.end("<h2>No authorization code in the callback. You can close this tab.</h2>");
      resolveOnce({ ok: false, error: failure("invalid_input", "The callback has no authorization code.") });
      return;
    }
    res.end("<h2>Authorized. You can close this tab and return to the terminal.</h2>");
    resolveOnce({ ok: true, code });
  });

  const listen = (port: number, host?: string) =>
    new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => reject(error);
      server.once("error", onError);
      server.listen(port, host, () => {
        server.off("error", onError);
        resolve();
      });
    });

  try {
    if (params.redirectUri) {
      const parsed = new URL(params.redirectUri);
      const port = parsed.port ? Number(parsed.port) : 80;
      await listen(port);
    } else {
      await listen(0, params.ephemeralHost ?? "127.0.0.1");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") return { ok: false, error: failure("port_in_use") };
    return { ok: false, error: classifyFetchError(error) };
  }

  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : 0;
  const redirectUri = params.redirectUri ?? `http://${params.ephemeralHost ?? "127.0.0.1"}:${boundPort}`;

  const timeoutMs = params.timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS;
  const timer = setTimeout(() => {
    resolveOnce({
      ok: false,
      error: failure(
        "authorization_timeout",
        "No callback arrived within two minutes. Run authorize again, or paste the callback URL when prompted.",
      ),
    });
  }, timeoutMs);
  timer.unref?.();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    server.close();
    if (activeLoopback === loopback) activeLoopback = undefined;
  };

  const loopback: LoopbackServer = {
    redirectUri,
    waitForCallback: async () => {
      const result = await callback;
      close();
      return result;
    },
    close,
  };
  activeLoopback = loopback;

  return { ok: true, server: loopback };
}

/** Open a URL with the platform's browser opener. Best effort, never throws. */
export function openInBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = execFile(command, args, () => {});
    child.on("error", () => {});
  } catch {
    // The URL is still in the action text; opening is an enhancement.
  }
}
