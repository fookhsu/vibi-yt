/**
 * The five user-invoked actions (tickets G1/G3/G4).
 *
 * Authorization is a user act, never a model-triggered side effect. Core owns
 * the half of the state machine the host cannot: consent, the loopback server,
 * the code exchange, refresh, and revocation.
 */

import fs from "node:fs";

import type { Action, ActionContext, ActionResult, Failure } from "../tools/types.ts";
import type { OAuthClient } from "./oauth-client.ts";
import { failure } from "./failures.ts";
import {
  clearApiKeyFile,
  clientJsonPath,
  credentialPaths,
  deleteTokenFile,
  resolveRefreshToken,
  writeApiKeyFile,
  writeTokenFile,
} from "./credentials.ts";
import { deriveRedirectUri, parseClientJson } from "./oauth-client.ts";
import {
  buildAuthUrl,
  createPkce,
  exchangeAuthorizationCode,
  openInBrowser,
  parsePastedCallback,
  revokeToken,
  startLoopbackServer,
} from "./oauth-flow.ts";
import { tokenFromResponse } from "./token-store.ts";
import { TESTING_REMINDER, formatStatusText, readAuthState } from "./auth-state.ts";

function failureResult(error: Failure, text: string, context: ActionContext): ActionResult {
  context.notify?.(`${text}\n\n${error.hint}`, "error");
  return { ok: false, text, error };
}

function loadClient(context: ActionContext): { ok: true; client: OAuthClient } | { ok: false; error: Failure } {
  const paths = credentialPaths(context.agentDir);
  const filePath = clientJsonPath(paths, process.env);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {
      ok: false,
      error: failure(
        "client_config_invalid",
        `No readable OAuth client JSON at ${filePath}. Download one from Google Cloud and point YOUTUBE_OAUTH_CLIENT_JSON at it.`,
      ),
    };
  }
  return parseClientJson(raw);
}

async function runAuthorize(context: ActionContext): Promise<ActionResult> {
  const paths = credentialPaths(context.agentDir);
  const loaded = loadClient(context);
  if (!loaded.ok) return failureResult(loaded.error, "Authorization could not start.", context);
  const client = loaded.client;

  const derived = deriveRedirectUri(client, process.env);
  if ("error" in derived) {
    return failureResult(derived.error, "Authorization could not start.", context);
  }

  const pkce = createPkce();
  const started = await startLoopbackServer(
    derived.kind === "fixed"
      ? { redirectUri: derived.uri, state: pkce.state }
      : { state: pkce.state, ephemeralHost: derived.host },
  );
  if (!started.ok) return failureResult(started.error, "Authorization could not start.", context);
  const server = started.server;

  const onAbort = () => server.close();
  context.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const authUrl = buildAuthUrl({
      client,
      redirectUri: server.redirectUri,
      state: pkce.state,
      challenge: pkce.challenge,
    });
    const header = `Open this URL to authorize vibi-yt:\n${authUrl}`;
    context.onUrl?.(authUrl);
    (context.openBrowser ?? openInBrowser)(authUrl);
    context.notify?.(`${header}\n\nWaiting for the browser callback for up to two minutes…`, "info");

    let code: string | undefined;
    const callback = await server.waitForCallback();
    if (callback.ok) {
      code = callback.code;
    } else if (callback.error.code === "authorization_timeout" && context.prompt) {
      const pasted = await context.prompt(
        "Paste the full callback URL from the browser address bar (or just the code):",
      );
      if (pasted === undefined) {
        return failureResult(
          failure("authorization_timeout", "Authorization cancelled."),
          header,
          context,
        );
      }
      const parsed = parsePastedCallback(pasted, { state: pkce.state });
      if (!parsed.ok) return failureResult(parsed.error, header, context);
      code = parsed.code;
    } else {
      return failureResult(callback.error, header, context);
    }

    const exchanged = await exchangeAuthorizationCode({
      client,
      redirectUri: server.redirectUri,
      code,
      verifier: pkce.verifier,
      fetchFn: context.fetchFn,
    });
    if (!exchanged.ok) return failureResult(exchanged.error, header, context);

    let record;
    try {
      record = tokenFromResponse(exchanged.tokenResponse, {
        clientId: client.clientId,
        priorRefreshToken: undefined,
      });
    } catch {
      return failureResult(
        failure("network_or_upstream_error", "Google returned no refresh token; run authorize again."),
        header,
        context,
      );
    }

    writeTokenFile(paths.tokenFile, record);
    const text = `${header}\n\nAuthorization complete. Stored the token at ${paths.tokenFile} (mode 0600).\n\n${TESTING_REMINDER}`;
    context.notify?.(text, "info");
    return { ok: true, text, state: readAuthState({ agentDir: context.agentDir }) };
  } finally {
    context.signal?.removeEventListener("abort", onAbort);
    server.close();
  }
}

async function runDeauthorize(context: ActionContext): Promise<ActionResult> {
  const paths = credentialPaths(context.agentDir);
  const resolved = resolveRefreshToken(paths, process.env);
  if (!resolved.refreshToken) {
    return { ok: true, text: "No stored authorization to revoke." };
  }

  // Remote first, then local — local credentials are removed either way so a
  // network failure cannot leave a token we can no longer revoke.
  const revoked = await revokeToken({ token: resolved.refreshToken, fetchFn: context.fetchFn });
  const deleted = deleteTokenFile(paths.tokenFile);

  if (!revoked.ok) {
    const text = `Removed the local token file, but Google revoke failed (${revoked.error.code}). Revoke access manually at https://myaccount.google.com/permissions.`;
    return { ok: false, text, error: revoked.error };
  }
  return {
    ok: true,
    text: deleted
      ? "Revoked the authorization at Google and removed the local token file."
      : "Revoked the authorization at Google; the local token file was already absent.",
  };
}

async function runStatus(context: ActionContext): Promise<ActionResult> {
  const state = readAuthState({ agentDir: context.agentDir });
  const text = formatStatusText(state);
  context.notify?.(text, "info");
  return { ok: true, text, state };
}

async function runSetApiKey(context: ActionContext): Promise<ActionResult> {
  if (!context.prompt) {
    return {
      ok: false,
      text: "This host cannot prompt for a value, so no API key was stored.",
      error: failure("invalid_input", "Set YOUTUBE_API_KEY in the environment instead."),
    };
  }
  const entered = await context.prompt("YouTube Data API key:");
  const apiKey = (entered ?? "").trim();
  if (!apiKey) {
    return {
      ok: false,
      text: "No API key was stored.",
      error: failure("invalid_input", "An empty value was entered."),
    };
  }

  const paths = credentialPaths(context.agentDir);
  writeApiKeyFile(paths.apiKeyFile, apiKey);
  return {
    ok: true,
    text: `Stored the API key at ${paths.apiKeyFile} (mode 0600). The value was not echoed to the model.`,
  };
}

async function runClearApiKey(context: ActionContext): Promise<ActionResult> {
  const paths = credentialPaths(context.agentDir);
  const removed = clearApiKeyFile(paths.apiKeyFile);
  return {
    ok: true,
    text: removed
      ? "Removed the stored API key. YOUTUBE_API_KEY is unchanged."
      : "No stored API key to remove. YOUTUBE_API_KEY is unchanged.",
  };
}

export const vibiActions: Action[] = [
  {
    name: "authorize",
    description: "Authorize vibi-yt to read your YouTube subscriptions via Google OAuth.",
    run: runAuthorize,
  },
  {
    name: "deauthorize",
    description: "Revoke the YouTube authorization at Google and delete the local token.",
    run: runDeauthorize,
  },
  {
    name: "status",
    description: "Report credential sources and authorization state without revealing any value.",
    run: runStatus,
  },
  {
    name: "set-api-key",
    description: "Store a YouTube Data API key.",
    run: runSetApiKey,
  },
  {
    name: "clear-api-key",
    description: "Delete the stored YouTube Data API key.",
    run: runClearApiKey,
  },
];
