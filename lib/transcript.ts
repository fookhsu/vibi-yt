/**
 * Transcript capability (ticket G2).
 *
 * The provider's diagnostics are generalized rather than re-serialized: every
 * outcome becomes a closed-set `Failure` with a hint that names the tried
 * language and, when the provider knows them, the available ones.
 */

import { fetchTranscript as defaultFetchTranscript } from "youtube-transcript-plus";

import type { Failure } from "../tools/types.ts";
import { errorName } from "./errors.ts";
import { failure } from "./failures.ts";

export interface TranscriptSegment {
  /** Start time in seconds. */
  start: number;
  /** Duration in seconds. */
  dur: number;
  text: string;
}

export interface TranscriptLine {
  offset: number;
  duration: number;
  text: string;
}

export type TranscriptFetcher = (
  videoId: string,
  options: { lang?: string },
) => Promise<TranscriptLine[]>;

export type TranscriptFetchResult =
  | { ok: true; segments: TranscriptSegment[] }
  | { ok: false; error: Failure };

export interface TranscriptFetchOptions {
  lang?: string;
  fetcher?: TranscriptFetcher;
}

const MAX_AVAILABLE_LANGS = 8;
const MAX_LANG_CHARS = 30;
const MAX_ERROR_EXCERPT_CHARS = 160;

function sanitizeOneLine(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length <= maxLength
    ? cleaned
    : `${cleaned.slice(0, Math.max(0, maxLength - 1))}…`;
}

function availableLanguages(error: unknown): string[] | undefined {
  if (!error || typeof error !== "object" || !("availableLangs" in error)) return undefined;
  const value = (error as { availableLangs?: unknown }).availableLangs;
  if (!Array.isArray(value)) return undefined;
  const langs = value
    .map((item) => sanitizeOneLine(String(item), MAX_LANG_CHARS))
    .filter((item) => item.length > 0)
    .slice(0, MAX_AVAILABLE_LANGS);
  return langs.length > 0 ? langs : undefined;
}

function classifyTranscriptError(error: unknown, lang: string): Failure {
  const name = errorName(error);

  if (name === "YoutubeTranscriptNotAvailableLanguageError") {
    const langs = availableLanguages(error);
    const hint = langs
      ? `Language "${lang}" has no caption track on this video. Try one of: ${langs.join(", ")}.`
      : `Language "${lang}" has no caption track on this video. Try another lang.`;
    return failure("transcript_unavailable", hint);
  }

  if (
    name === "YoutubeTranscriptDisabledError" ||
    name === "YoutubeTranscriptNotAvailableError" ||
    name === "YoutubeTranscriptInvalidLangError"
  ) {
    return failure("transcript_unavailable");
  }

  if (
    name === "YoutubeTranscriptVideoUnavailableError" ||
    name === "YoutubeTranscriptInvalidVideoIdError"
  ) {
    return failure("not_found");
  }

  if (name === "YoutubeTranscriptTooManyRequestError") {
    return failure("network_or_upstream_error", "YouTube is rate-limiting transcript requests. Retry later.");
  }

  const excerpt = error instanceof Error ? error.message : String(error);
  return failure(
    "network_or_upstream_error",
    `Transcript fetch failed with an unexpected provider error (${sanitizeOneLine(excerpt, MAX_ERROR_EXCERPT_CHARS)}). Retry later.`,
  );
}

export async function fetchTranscriptSegments(
  videoId: string,
  options: TranscriptFetchOptions = {},
): Promise<TranscriptFetchResult> {
  const lang = options.lang ?? "en";
  const fetcher: TranscriptFetcher =
    options.fetcher ?? ((id, opts) => defaultFetchTranscript(id, opts));

  try {
    const raw = await fetcher(videoId, { lang });
    if (raw.length === 0) {
      return { ok: false, error: failure("transcript_unavailable") };
    }
    return {
      ok: true,
      segments: raw.map((line) => ({ start: line.offset, dur: line.duration, text: line.text })),
    };
  } catch (error) {
    return { ok: false, error: classifyTranscriptError(error, lang) };
  }
}

/** The whole transcript as one text; this is what gets previewed and spilled. */
export function fullTranscriptText(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join(" ");
}
