import { Type, type Static } from "typebox";

import { resolveApiKeyAuth } from "../lib/auth-session.ts";
import { SPILL_THRESHOLD_CHARS } from "../lib/output.ts";
import { deliverContent, mergeFields } from "../lib/present.ts";
import { fetchTranscriptSegments, fullTranscriptText, type TranscriptSegment } from "../lib/transcript.ts";
import { getVideoDetails } from "../lib/youtube-api.ts";
import { asStringArray, failureFields, joinPreviews } from "./shared.ts";
import type { Detail, Failure, Tool, ToolContext, ToolResult } from "./types.ts";

export const transcriptInputSchema = Type.Object({
  videoIds: Type.Array(Type.String({ description: "A YouTube video ID." }), {
    minItems: 1,
    maxItems: 10,
    description: "One to ten video IDs. A single video is still written as an array.",
  }),
  lang: Type.Optional(
    Type.String({ default: "en", description: "Caption language code, e.g. en, de, ja. Defaults to en." }),
  ),
  detail: Type.Optional(
    Type.Union([Type.Literal("compact"), Type.Literal("full")], {
      default: "compact",
      description:
        "compact (default) returns only the opening and closing windows; full returns the whole transcript.",
    }),
  ),
});

export type TranscriptInput = Static<typeof transcriptInputSchema>;

export interface TranscriptEntry {
  lang: string;
  segments: number;
  text?: string;
}

export interface TranscriptData {
  transcripts: Record<string, TranscriptEntry>;
  /** Per-video failures when some videos succeeded and others did not. */
  failures?: Record<string, Failure>;
}

const DESCRIPTION =
  "Get the caption track of one to ten YouTube videos in one language (`lang`, default `en`). `detail` controls the amount: compact (default) returns only the opening and closing windows of the transcript, so `truncated` is true when the transcript is longer than those windows; full returns the whole transcript, and content over 8,000 characters is written to a JSONL file — you then receive a preview plus a path, and nothing is lost. A `truncated: true` field means you did not receive the whole transcript. If a video has no captions in that language, try another `lang`. When some videos fail and others succeed, the failures appear under `failures` in the data.";

function segmentLines(segments: TranscriptSegment[]): string[] {
  return segments.map((segment) =>
    JSON.stringify({ start: segment.start, dur: segment.dur, text: segment.text }),
  );
}

async function lookupTitles(ids: string[], context: ToolContext): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const auth = resolveApiKeyAuth({ agentDir: context.agentDir, env: process.env });
  if (!auth.ok) return {};
  const result = await getVideoDetails(ids, { auth: auth.auth, fetchFn: context.fetchFn, signal: context.signal });
  if (!result.ok) return {};
  const titles: Record<string, string> = {};
  for (const [id, item] of Object.entries(result.data)) {
    if (item?.title) titles[id] = item.title;
  }
  return titles;
}

export const youtubeTranscript: Tool<TranscriptInput, TranscriptData> = {
  name: "youtube_transcript",
  description: DESCRIPTION,
  promptSnippet: "Get the caption track (transcript) of one or more YouTube videos",
  promptGuidelines: [
    "Use youtube_transcript when the user asks what a video says or wants a transcript or subtitles.",
  ],
  parameters: transcriptInputSchema,

  async execute(input, context): Promise<ToolResult<TranscriptData>> {
    const ids = asStringArray(input.videoIds).slice(0, 10);
    if (ids.length === 0) {
      return {
        ok: false,
        error: { code: "invalid_input", hint: "Provide 1 to 10 video IDs.", retryable: false },
        fields: failureFields(),
      };
    }

    const lang = (input.lang ?? "en").trim() || "en";
    const detail: Detail = input.detail ?? "compact";

    const fetched = new Map<string, { segments: TranscriptSegment[]; fullText: string }>();
    const failures: Record<string, Failure> = {};
    let firstError: Failure | undefined;

    for (const id of ids) {
      const result = await fetchTranscriptSegments(id, {
        lang,
        fetcher: context.transcriptFetcher,
      });
      if (!result.ok) {
        failures[id] = result.error;
        firstError ??= result.error;
        continue;
      }
      fetched.set(id, { segments: result.segments, fullText: fullTranscriptText(result.segments) });
    }

    if (fetched.size === 0) {
      return { ok: false, error: firstError ?? { code: "transcript_unavailable", hint: "No transcript could be fetched.", retryable: false }, fields: failureFields() };
    }

    // Titles are only needed to name spill files, which only `full` can produce.
    const needsTitle =
      detail === "full"
        ? [...fetched.entries()].filter(([, value]) => value.fullText.length > SPILL_THRESHOLD_CHARS).map(([id]) => id)
        : [];
    const titles = await lookupTitles(needsTitle, context);

    const transcripts: Record<string, TranscriptEntry> = {};
    const fieldsList = [];
    const previews: Array<{ videoId: string; text: string }> = [];

    for (const [id, value] of fetched) {
      const delivery = deliverContent({
        fullText: value.fullText,
        detail,
        artifactsDir: context.artifactsDir,
        spill: {
          title: titles[id] ?? "transcript",
          videoId: id,
          lines: segmentLines(value.segments),
        },
      });

      const entry: TranscriptEntry = { lang, segments: value.segments.length };
      if (delivery.inlineText !== undefined) entry.text = delivery.inlineText;
      transcripts[id] = entry;

      fieldsList.push(delivery.fields);
      if (delivery.fields.preview !== undefined) {
        previews.push({ videoId: id, text: delivery.fields.preview });
      }
    }

    const merged = mergeFields(...fieldsList);
    const preview = joinPreviews(previews);
    if (preview !== undefined) merged.preview = preview;
    merged.records = Object.keys(transcripts).length;

    const data: TranscriptData = { transcripts };
    if (Object.keys(failures).length > 0) data.failures = failures;
    return { ok: true, data, fields: merged };
  },
};
