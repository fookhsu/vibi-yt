/**
 * OAuth client JSON parsing and redirect derivation (tickets G3/G4).
 *
 * The client JSON is read in place, in Google's own format — no copy, no
 * custom schema. Its top-level key (`web` or `installed`) decides which
 * redirect the flow may use: `installed` may take an ephemeral loopback port,
 * `web` must use the exact registered value.
 */

import type { Failure } from "../tools/types.ts";
import { failure } from "./failures.ts";

export type OAuthClientType = "web" | "installed";

export interface OAuthClient {
  type: OAuthClientType;
  clientId: string;
  clientSecret?: string;
  authUri: string;
  tokenUri: string;
  projectId?: string;
  redirectUris?: string[];
}

export type ParseClientResult =
  | { ok: true; client: OAuthClient }
  | { ok: false; error: Failure };

const DEFAULT_AUTH_URI = "https://accounts.google.com/o/oauth2/auth";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
export const DEFAULT_REDIRECT_URI = "http://localhost:6969";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function parseClientJson(raw: unknown): ParseClientResult {
  const root = asRecord(raw);
  if (!root) return { ok: false, error: failure("client_config_invalid") };

  const type: OAuthClientType | undefined =
    "web" in root ? "web" : "installed" in root ? "installed" : undefined;
  if (!type) return { ok: false, error: failure("client_config_invalid") };

  const section = asRecord(root[type]);
  if (!section) return { ok: false, error: failure("client_config_invalid") };

  const clientId = nonEmptyString(section["client_id"]);
  if (!clientId) return { ok: false, error: failure("client_config_invalid") };

  const redirectUris = Array.isArray(section["redirect_uris"])
    ? section["redirect_uris"].filter((u): u is string => typeof u === "string")
    : undefined;

  const client: OAuthClient = {
    type,
    clientId,
    authUri: nonEmptyString(section["auth_uri"]) ?? DEFAULT_AUTH_URI,
    tokenUri: nonEmptyString(section["token_uri"]) ?? DEFAULT_TOKEN_URI,
  };
  const clientSecret = nonEmptyString(section["client_secret"]);
  if (clientSecret) client.clientSecret = clientSecret;
  const projectId = nonEmptyString(section["project_id"]);
  if (projectId) client.projectId = projectId;
  if (redirectUris) client.redirectUris = redirectUris;

  return { ok: true, client };
}

export type RedirectDerivation =
  | { kind: "fixed"; uri: string }
  | { kind: "ephemeral"; host: string }
  | { error: Failure };

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * `web` clients are pinned to the registered redirect (default
 * `http://localhost:6969`); `installed` clients may pick any loopback port.
 */
export function deriveRedirectUri(
  client: OAuthClient,
  env: Record<string, string | undefined>,
): RedirectDerivation {
  if (client.type === "installed") {
    return { kind: "ephemeral", host: "127.0.0.1" };
  }

  const configured = nonEmptyString(env["YOUTUBE_OAUTH_REDIRECT_URI"]);
  const uri = configured ?? DEFAULT_REDIRECT_URI;
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return { error: failure("client_config_invalid", "YOUTUBE_OAUTH_REDIRECT_URI is not a valid URL.") };
  }
  if (parsed.protocol !== "http:" || !isLoopbackHost(parsed.hostname)) {
    return {
      error: failure(
        "client_config_invalid",
        "A web OAuth client must redirect to a loopback http address, e.g. http://localhost:6969, matching the Google Cloud console.",
      ),
    };
  }
  return { kind: "fixed", uri };
}
