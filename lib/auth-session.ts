/**
 * Per-capability credential resolution (ticket G4).
 *
 * Subscriptions only ever use OAuth; the other tools prefer the API key even
 * when an OAuth token exists. There is deliberately no automatic fallback.
 */

import type { Failure, FetchLike } from "../tools/types.ts";
import { failure } from "./failures.ts";
import { readJsonFile } from "./json-file.ts";
import {
  clientJsonPath,
  credentialPaths,
  resolveApiKey,
  resolveRefreshToken,
  writeTokenFile,
} from "./credentials.ts";
import { withFileMutationQueue } from "./file-queue.ts";
import type { ApiAuth } from "./youtube-api.ts";
import { parseClientJson } from "./oauth-client.ts";
import { refreshAccessToken } from "./oauth-flow.ts";
import { needsRefresh, tokenFromResponse } from "./token-store.ts";

export interface AuthRequest {
  agentDir: string;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike | undefined;
  signal?: AbortSignal | undefined;
  now?: Date;
}

export type AuthResolution = { ok: true; auth: ApiAuth } | { ok: false; error: Failure };

export function resolveApiKeyAuth(request: AuthRequest): AuthResolution {
  const env = request.env ?? process.env;
  const key = resolveApiKey(credentialPaths(request.agentDir), env);
  if (!key.apiKey) {
    return {
      ok: false,
      error: failure(
        "not_authorized",
        "No YouTube API key is configured. Ask the user to store one with the set-api-key action, or set YOUTUBE_API_KEY.",
      ),
    };
  }
  return { ok: true, auth: { kind: "api_key", apiKey: key.apiKey } };
}

export async function resolveOAuthAuth(request: AuthRequest): Promise<AuthResolution> {
  const env = request.env ?? process.env;
  const now = request.now ?? new Date();
  const paths = credentialPaths(request.agentDir);

  const resolved = resolveRefreshToken(paths, env);
  if (!resolved.refreshToken) {
    return {
      ok: false,
      error: failure(
        "not_authorized",
        "Subscriptions need authorization. Ask the user to run the authorize action first.",
      ),
    };
  }

  // A still-fresh cached access token avoids a refresh round-trip.
  if (
    resolved.record &&
    resolved.record.access_token &&
    !needsRefresh(resolved.record, now)
  ) {
    return { ok: true, auth: { kind: "bearer", accessToken: resolved.record.access_token } };
  }

  const parsed = parseClientJson(readJsonFile(clientJsonPath(paths, env)));
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Serialize the read-modify-write of the token file so concurrent calls do
  // not refresh on top of each other.
  return withFileMutationQueue(paths.tokenFile, async () => {
    const current = resolveRefreshToken(paths, env);
    if (current.record?.access_token && !needsRefresh(current.record, now)) {
      return { ok: true, auth: { kind: "bearer", accessToken: current.record.access_token } };
    }
    const refreshToken = current.refreshToken ?? resolved.refreshToken;
    if (!refreshToken) {
      return {
        ok: false,
        error: failure("not_authorized", "Subscriptions need authorization. Run authorize first."),
      };
    }

    const refreshed = await refreshAccessToken({
      client: parsed.client,
      refreshToken,
      fetchFn: request.fetchFn,
    });
    if (!refreshed.ok) return { ok: false, error: refreshed.error };

    let record;
    try {
      record = tokenFromResponse(refreshed.tokenResponse, {
        clientId: parsed.client.clientId,
        priorRefreshToken: refreshToken,
        now,
      });
    } catch {
      return { ok: false, error: failure("network_or_upstream_error") };
    }

    if (!record.access_token) {
      return { ok: false, error: failure("network_or_upstream_error") };
    }

    // Best effort: a read-only environment (CI with an env refresh token) need
    // not be writable.
    try {
      writeTokenFile(paths.tokenFile, record);
    } catch {
      // Ignored; the access token still works for this call.
    }

    return { ok: true, auth: { kind: "bearer", accessToken: record.access_token } };
  });
}
