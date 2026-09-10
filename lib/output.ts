/**
 * Context budget: preview windows and spill mechanics (ADR 0002).
 *
 * Nothing here is truncation: a spill writes the *whole* text to a JSONL
 * artifact and hands back a preview plus a pointer. `truncated` only becomes
 * true when content was actually lost — a `compact` clip, or a spill that
 * could not be written.
 */

import fs from "node:fs";
import path from "node:path";

import type { SpillInfo } from "../tools/types.ts";

/** Characters in each of the two preview windows (opening and closing). */
export const PREVIEW_WINDOW_CHARS = 2_000;
/** Content longer than this spills instead of travelling inline. */
export const SPILL_THRESHOLD_CHARS = 8_000;
const PREVIEW_SEPARATOR = "\n…\n";
const MAX_FILE_NAME_CHARS = 120;
const MAX_VIDEO_ID_CHARS = 32;

/** True when the two windows cannot cover the whole text. */
export function isLossy(text: string): boolean {
  return text.length > PREVIEW_WINDOW_CHARS * 2;
}

/** Opening + closing windows. Short text is returned whole. */
export function previewOf(text: string): string {
  if (!isLossy(text)) return text;
  return `${text.slice(0, PREVIEW_WINDOW_CHARS)}${PREVIEW_SEPARATOR}${text.slice(-PREVIEW_WINDOW_CHARS)}`;
}

/** Strip characters that cannot appear in a file name, and cap the length. */
export function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[/:\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "untitled";
  return cleaned.length <= MAX_FILE_NAME_CHARS
    ? cleaned
    : cleaned.slice(0, MAX_FILE_NAME_CHARS).trim();
}

export interface SpillUnit {
  /** Human-recognisable title, used for the file name. */
  title: string;
  /** The video the content belongs to; keeps same-titled videos apart. */
  videoId: string;
  /** One JSON object per line, already serialized. */
  lines: string[];
}

export interface SpillOutcome {
  spilled: SpillInfo[];
  /** True when at least one unit could not be written (the caller must mark truncation). */
  failed: boolean;
}

/** Write each unit to `<sanitized-title>-<videoId>.jsonl` under `dir`. */
export function spillUnits(units: SpillUnit[], dir: string): SpillOutcome {
  const spilled: SpillInfo[] = [];
  let failed = false;

  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return { spilled: [], failed: true };
  }

  for (const unit of units) {
    const title = sanitizeFileName(unit.title);
    const videoId = sanitizeFileName(unit.videoId).slice(0, MAX_VIDEO_ID_CHARS);
    const filePath = path.join(dir, `${title}-${videoId}.jsonl`);
    const content = `${unit.lines.join("\n")}\n`;
    try {
      fs.writeFileSync(filePath, content, { encoding: "utf8", mode: 0o600 });
      spilled.push({
        path: filePath,
        title: unit.title,
        bytes: Buffer.byteLength(content, "utf8"),
        lines: unit.lines.length,
      });
    } catch {
      failed = true;
    }
  }

  return { spilled, failed };
}
