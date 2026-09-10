/**
 * Credential storage and resolution (ticket G4).
 *
 * Three files: the API key file, the OAuth token file, and the user's client
 * JSON read in place. Files are 0600, directories 0700, and writes are atomic.
 * Resolution is per capability: subscriptions only ever use OAuth, everything
 * else prefers the API key — never an automatic fallback, which would burn two
 * quota calls and return two errors for one failure.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ApiKeySource, CredentialPaths, OAuthSource } from "../tools/types.ts";
import { readJsonFile } from "./json-file.ts";
import type { TokenRecord } from "./token-store.ts";

interface AuthFile {
  type: "api_key";
  apiKey: string;
  updatedAt: string;
}

export function defaultAgentDir(
  env: Record<string, string | undefined>,
  home: string = os.homedir(),
): string {
  const configured = env["PI_CODING_AGENT_DIR"]?.trim();
  if (configured) return expandHome(configured, home);
  return path.join(home, ".pi", "agent");
}

export function credentialPaths(agentDir: string): CredentialPaths {
  return {
    clientJson: path.join(agentDir, "vibi-oauth-client.json"),
    tokenFile: path.join(agentDir, "vibi-oauth-token.json"),
    apiKeyFile: path.join(agentDir, "vibi-auth.json"),
  };
}

export function expandHome(value: string, home: string = os.homedir()): string {
  if (value === "~") return home;
  if (value.startsWith("~/")) return path.join(home, value.slice(2));
  return value;
}

/** The client JSON path: `YOUTUBE_OAUTH_CLIENT_JSON` (with `~`) or the agent dir. */
export function clientJsonPath(
  paths: CredentialPaths,
  env: Record<string, string | undefined>,
  home: string = os.homedir(),
): string {
  const override = env["YOUTUBE_OAUTH_CLIENT_JSON"]?.trim();
  return override ? expandHome(override, home) : paths.clientJson;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // A directory we do not own is not fatal here; the write will report.
  }
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort; mode was set at creation.
  }
}


export interface ResolvedApiKey {
  apiKey?: string;
  source: ApiKeySource;
}

export function resolveApiKey(
  paths: CredentialPaths,
  env: Record<string, string | undefined>,
): ResolvedApiKey {
  const fromEnv = env["YOUTUBE_API_KEY"]?.trim();
  if (fromEnv) return { apiKey: fromEnv, source: "environment" };

  const file = readJsonFile(paths.apiKeyFile);
  if (file && typeof file === "object") {
    const apiKey = (file as Partial<AuthFile>).apiKey;
    if (typeof apiKey === "string" && apiKey.trim().length > 0) {
      return { apiKey, source: "stored" };
    }
  }
  return { source: "none" };
}

export function writeApiKeyFile(filePath: string, apiKey: string, now: Date = new Date()): void {
  const data: AuthFile = { type: "api_key", apiKey, updatedAt: now.toISOString() };
  writeJsonAtomic(filePath, data);
}

export function clearApiKeyFile(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function readTokenFile(filePath: string): TokenRecord | undefined {
  const raw = readJsonFile(filePath);
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Partial<TokenRecord>;
  if (typeof record.refresh_token !== "string" || record.refresh_token.length === 0) return undefined;
  if (typeof record.client_id !== "string") return undefined;
  return {
    client_id: record.client_id,
    refresh_token: record.refresh_token,
    access_token: typeof record.access_token === "string" ? record.access_token : undefined,
    expires_at: typeof record.expires_at === "number" ? record.expires_at : 0,
    scope: typeof record.scope === "string" ? record.scope : undefined,
    obtained_at: typeof record.obtained_at === "string" ? record.obtained_at : new Date(0).toISOString(),
  };
}

export function writeTokenFile(filePath: string, record: TokenRecord): void {
  writeJsonAtomic(filePath, record);
}

export function deleteTokenFile(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface ResolvedRefreshToken {
  refreshToken?: string;
  source: OAuthSource;
  record?: TokenRecord;
}

export function resolveRefreshToken(
  paths: CredentialPaths,
  env: Record<string, string | undefined>,
): ResolvedRefreshToken {
  const fromEnv = env["YOUTUBE_OAUTH_REFRESH_TOKEN"]?.trim();
  if (fromEnv) return { refreshToken: fromEnv, source: "environment" };

  const record = readTokenFile(paths.tokenFile);
  if (record) return { refreshToken: record.refresh_token, source: "token_file", record };
  return { source: "none" };
}
