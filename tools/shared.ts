/** Shared helpers for the tool specs. */

import { emptyFields } from "../lib/present.ts";
import type { RenderFields } from "./types.ts";

/** The render fields a failure carries: nothing happened, nothing was lost. */
export function failureFields(): RenderFields {
  return emptyFields();
}

export function clampResults(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/** Combine per-video preview windows into one preview string. */
export function joinPreviews(
  entries: Array<{ videoId: string; text: string }>,
): string | undefined {
  if (entries.length === 0) return undefined;
  if (entries.length === 1) return entries[0]!.text;
  return entries.map((entry) => `## ${entry.videoId}\n${entry.text}`).join("\n\n");
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}
