/**
 * Turning long content into render fields (ADR 0002).
 *
 * `compact` previews and never spills. `full` inlines, or spills past the
 * threshold and hands back a pointer. `truncated` is true only when the model
 * did not receive the content *and* it is not retrievable from a spill file.
 */

import os from "node:os";

import type { Detail, RenderFields } from "../tools/types.ts";
import { SPILL_THRESHOLD_CHARS, isLossy, previewOf, spillUnits } from "./output.ts";

export function emptyFields(): RenderFields {
  return { truncated: false, spilled: [] };
}

/** Combine per-video fields: any loss wins, spills accumulate. */
export function mergeFields(...list: RenderFields[]): RenderFields {
  const merged = emptyFields();
  for (const fields of list) {
    merged.truncated = merged.truncated || fields.truncated;
    merged.spilled.push(...fields.spilled);
    if (fields.preview !== undefined) merged.preview = fields.preview;
    if (fields.records !== undefined) merged.records = fields.records;
  }
  return merged;
}

export interface ContentSpillUnit {
  title: string;
  videoId: string;
  lines: string[];
}

export interface DeliverContentParams {
  /** The whole content: transcript text or video description. */
  fullText: string;
  detail: Detail;
  artifactsDir?: string | undefined;
  /** Describes the JSONL artifact when this content needs to spill. */
  spill?: ContentSpillUnit | undefined;
}

export interface ContentDelivery {
  /** Text to place in `data`; absent when the caller should omit it. */
  inlineText?: string;
  fields: RenderFields;
}

export function deliverContent(params: DeliverContentParams): ContentDelivery {
  const { fullText, detail } = params;
  if (fullText.length === 0) return { fields: emptyFields() };

  if (detail === "compact") {
    return {
      fields: { truncated: isLossy(fullText), spilled: [], preview: previewOf(fullText) },
    };
  }

  if (fullText.length > SPILL_THRESHOLD_CHARS) {
    const dir = params.artifactsDir ?? os.tmpdir();
    const outcome = params.spill
      ? spillUnits([params.spill], dir)
      : { spilled: [], failed: true };
    if (outcome.spilled.length === 0) {
      return { fields: { truncated: true, spilled: [], preview: previewOf(fullText) } };
    }
    return { fields: { truncated: false, spilled: outcome.spilled, preview: previewOf(fullText) } };
  }

  return { inlineText: fullText, fields: emptyFields() };
}
