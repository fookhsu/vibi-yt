/**
 * Machine-readable authorization state (ticket G3).
 *
 * This is metadata only. It never carries a key, a token, or a client secret.
 */

import type { AuthState } from "../tools/types.ts";
import { readJsonFile } from "./json-file.ts";
import {
  clientJsonPath,
  credentialPaths,
  resolveApiKey,
  resolveRefreshToken,
} from "./credentials.ts";
import { deriveRedirectUri, parseClientJson } from "./oauth-client.ts";
import { accessTokenSecondsRemaining } from "./token-store.ts";

export interface AuthStateRequest {
  agentDir: string;
  env?: Record<string, string | undefined>;
  now?: Date;
}

export function readAuthState(request: AuthStateRequest): AuthState {
  const env = request.env ?? process.env;
  const now = request.now ?? new Date();
  const paths = credentialPaths(request.agentDir);

  const apiKey = resolveApiKey(paths, env);
  const oauth = resolveRefreshToken(paths, env);

  const state: AuthState = {
    apiKeySource: apiKey.source,
    oauthSource: oauth.source,
    authorized: oauth.source !== "none",
    subscriptionsAvailable: oauth.source !== "none",
  };

  const record = oauth.record;
  if (record) {
    const remaining = accessTokenSecondsRemaining(record, now);
    if (remaining !== undefined) {
      state.accessTokenValid = remaining > 0;
      state.accessTokenExpiresAt = new Date(record.expires_at).toISOString();
    }
  }

  const client = parseClientJson(readJsonFile(clientJsonPath(paths, env)));
  if (client.ok) {
    const redirect = deriveRedirectUri(client.client, env);
    const redirectUri =
      "kind" in redirect && redirect.kind === "fixed"
        ? redirect.uri
        : "http://127.0.0.1:<ephemeral>";
    state.client = {
      type: client.client.type,
      redirectUri,
      ...(client.client.projectId ? { projectId: client.client.projectId } : {}),
    };
  }

  return state;
}

/** The conditional 7-day reminder. We cannot detect the publishing status. */
export const TESTING_REMINDER =
  "If this OAuth project is still in Testing, the authorization expires 7 days after consent; publishing it to In production removes that.";

export function formatStatusText(state: AuthState): string {
  const sourceLabel: Record<string, string> = {
    environment: "environment variable",
    stored: "stored file",
    token_file: "token file",
    none: "none",
  };

  const lines: string[] = [];
  lines.push(
    `API key     : ${state.apiKeySource === "none" ? "none" : sourceLabel[state.apiKeySource]}`,
  );
  lines.push(
    `OAuth       : ${state.oauthSource === "none" ? "not authorized" : `authorized (${sourceLabel[state.oauthSource]})`}`,
  );

  if (state.accessTokenValid === true) {
    const minutes = state.accessTokenExpiresAt
      ? Math.max(0, Math.round((new Date(state.accessTokenExpiresAt).getTime() - Date.now()) / 60_000))
      : undefined;
    lines.push(
      `access token: valid${minutes !== undefined ? ` (~${minutes} min left)` : ""}`,
    );
  } else if (state.accessTokenValid === false) {
    lines.push("access token: expired (the next call refreshes it automatically)");
  }

  if (state.client) {
    const project = state.client.projectId ? ` · project ${state.client.projectId}` : "";
    lines.push(`client      : ${state.client.type}${project} · redirect ${state.client.redirectUri}`);
  }

  lines.push(
    state.subscriptionsAvailable
      ? "subscriptions: available"
      : "subscriptions: needs authorization (run the authorize action)",
  );
  lines.push(`reminder    : ${TESTING_REMINDER}`);

  return lines.join("\n");
}
