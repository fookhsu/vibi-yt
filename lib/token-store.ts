/**
 * Token lifecycle (ticket G4).
 *
 * The access token is refreshed proactively (60 s before it dies). The refresh
 * token is only ever declared dead by Google saying `invalid_grant` — local
 * expiry guesses would create false confidence.
 */

export interface TokenRecord {
  client_id: string;
  refresh_token: string;
  access_token?: string;
  /** Absolute epoch milliseconds; derived from Google's relative `expires_in`. */
  expires_at: number;
  scope?: string;
  obtained_at: string;
}

interface TokenResponseLike {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

export interface TokenFromResponseOptions {
  clientId: string;
  priorRefreshToken?: string | undefined;
  now?: Date;
}

const DEFAULT_EXPIRES_IN_SECONDS = 3_600;

/** Turn a Google token response into the record we persist. */
export function tokenFromResponse(
  response: unknown,
  options: TokenFromResponseOptions,
): TokenRecord {
  const json = (response ?? {}) as TokenResponseLike;
  const now = options.now ?? new Date();

  const accessToken = typeof json.access_token === "string" ? json.access_token : undefined;
  const newRefresh = typeof json.refresh_token === "string" ? json.refresh_token : undefined;
  const refreshToken = newRefresh ?? options.priorRefreshToken;
  if (!refreshToken) {
    throw new Error("Google did not return a refresh_token and no prior one is available.");
  }

  const expiresIn =
    typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
      ? json.expires_in
      : DEFAULT_EXPIRES_IN_SECONDS;

  const record: TokenRecord = {
    client_id: options.clientId,
    refresh_token: refreshToken,
    expires_at: now.getTime() + expiresIn * 1_000,
    obtained_at: now.toISOString(),
  };
  if (accessToken) record.access_token = accessToken;
  if (typeof json.scope === "string") record.scope = json.scope;
  return record;
}

const REFRESH_SKEW_MS = 60_000;

interface ExpiryLike {
  expires_at?: number | null;
}

/** True when the access token is missing, expiring, or expired. */
export function needsRefresh(record: ExpiryLike, now: Date = new Date()): boolean {
  const expiresAt = record.expires_at;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return true;
  return expiresAt - now.getTime() <= REFRESH_SKEW_MS;
}

/** Remaining access-token seconds, or `undefined` when there is no absolute expiry. */
export function accessTokenSecondsRemaining(
  record: ExpiryLike,
  now: Date = new Date(),
): number | undefined {
  const expiresAt = record.expires_at;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return undefined;
  return Math.max(0, Math.floor((expiresAt - now.getTime()) / 1_000));
}
