/**
 * Failure classification (ADR 0002, ticket G2/G3).
 *
 * Failure is data: a closed-set label, an executable hint, and whether retrying
 * could help. Upstream prose is never passed through verbatim — it may embed an
 * API key or a client secret.
 */

import type { Failure, FailureCode } from "../tools/types.ts";

interface FailureSpec {
  retryable: boolean;
  hint: string;
}

const SPECS: Record<FailureCode, FailureSpec> = {
  // Tool family
  not_authorized: {
    retryable: true,
    hint: "This needs authorization. Ask the user to run the authorize action, then retry.",
  },
  quota_exceeded: {
    retryable: false,
    hint: "The Google Cloud project's daily YouTube quota is exhausted; it resets at midnight Pacific time.",
  },
  not_found: {
    retryable: false,
    hint: "The video or channel does not exist, is private, or the ID is wrong. Check the ID and retry.",
  },
  transcript_unavailable: {
    retryable: false,
    hint: "This video has no usable caption track. Try another lang, or another video.",
  },
  invalid_input: {
    retryable: false,
    hint: "The arguments are outside the accepted shape or limits. Fix them and call again.",
  },
  network_or_upstream_error: {
    retryable: true,
    hint: "Retry in a moment. If it persists, check that this machine can reach the YouTube API (including any proxy).",
  },
  unknown_tool: {
    retryable: false,
    hint: "Call one of the youtube_* tools by its exact name.",
  },
  // Authorization family
  authorization_denied: {
    retryable: true,
    hint: "Consent was declined. Run authorize again if you change your mind.",
  },
  redirect_uri_mismatch: {
    retryable: false,
    hint: "The redirect URI must match one registered for this OAuth client in the Google Cloud console, exactly. For a web client it is fixed, so change the console or free the port.",
  },
  client_config_invalid: {
    retryable: false,
    hint: "The OAuth client JSON is missing or unreadable. Download a client from Google Cloud and point YOUTUBE_OAUTH_CLIENT_JSON at it.",
  },
  port_in_use: {
    retryable: true,
    hint: "The redirect port is taken. Free it (or stop the process using it) and run authorize again.",
  },
  service_disabled: {
    retryable: false,
    hint: "Enable YouTube Data API v3 in the Google Cloud project that owns the credential, then retry.",
  },
  authorization_timeout: {
    retryable: true,
    hint: "No callback arrived in time. Run authorize again and finish consent, or paste the callback URL when prompted.",
  },
};

export function failure(code: FailureCode, hint?: string, retryable?: boolean): Failure {
  const spec = SPECS[code];
  return {
    code,
    hint: hint && hint.trim().length > 0 ? hint : spec.hint,
    retryable: retryable ?? spec.retryable,
  };
}

interface YoutubeErrorBody {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

function reasonsOf(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const errors = (body as YoutubeErrorBody).error?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => String(e?.reason ?? "")).filter(Boolean);
}

/**
 * Map a YouTube Data API failure onto the closed set. The upstream message is
 * deliberately not reused in the hint.
 */
export function classifyYoutubeApiFailure(status: number, body: unknown): Failure {
  const reasons = reasonsOf(body).map((r) => r.toLowerCase());

  if (status === 401) return failure("not_authorized");
  if (status === 403) {
    if (reasons.some((r) => r.includes("quota") || r.includes("limitexceeded"))) {
      return failure("quota_exceeded");
    }
    if (reasons.some((r) => r === "accessnotconfigured" || r === "servicedisabled")) {
      return failure(
        "not_authorized",
        "YouTube Data API v3 is not enabled for the Google Cloud project that owns this credential. Enable it and retry.",
        false,
      );
    }
    return failure("not_authorized");
  }
  if (status === 404) return failure("not_found");
  if (status === 400) return failure("invalid_input");
  return failure("network_or_upstream_error");
}

/** Map a thrown transport error onto the closed set. */
export function classifyFetchError(_error: unknown): Failure {
  return failure("network_or_upstream_error");
}
