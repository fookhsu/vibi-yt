/**
 * The tool registry: one capability per tool (ticket G2).
 *
 * The registry is agent-neutral. Hosts project it onto their own tool API;
 * they never reach into individual tools.
 */

import type { Tool } from "./types.ts";
import { youtubeSearch } from "./youtube-search.ts";
import { youtubeSubscriptions } from "./youtube-subscriptions.ts";
import { youtubeTranscript } from "./youtube-transcript.ts";
import { youtubeVideoDetails } from "./youtube-video-details.ts";

/**
 * Heterogeneous tools share a registry, so the input type is erased here.
 * Each handler narrows its own input from the schema-validated value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;

export const youtubeTools: AnyTool[] = [
  youtubeSearch,
  youtubeVideoDetails,
  youtubeTranscript,
  youtubeSubscriptions,
];

export {
  youtubeSearch,
  youtubeVideoDetails,
  youtubeTranscript,
  youtubeSubscriptions,
};
