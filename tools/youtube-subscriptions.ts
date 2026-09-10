import { Type, type Static } from "typebox";

import { resolveOAuthAuth } from "../lib/auth-session.ts";
import { getSubscriptions, type Subscription } from "../lib/youtube-api.ts";
import { clampResults, failureFields } from "./shared.ts";
import type { Tool, ToolResult } from "./types.ts";

export const subscriptionsInputSchema = Type.Object({
  maxResults: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 50, default: 25, description: "How many subscriptions to return (1-50, default 25)." }),
  ),
  order: Type.Optional(
    Type.Union(
      [
        Type.Literal("alphabetical", { description: "Alphabetical by channel title." }),
        Type.Literal("relevance", { description: "By relevance." }),
        Type.Literal("unread", { description: "Channels with unread activity first." }),
      ],
      { description: "Ordering of the returned subscriptions." },
    ),
  ),
  channelId: Type.Optional(
    Type.String({ description: "Check whether the user is subscribed to this channel ID (existence check)." }),
  ),
});

export type SubscriptionsInput = Static<typeof subscriptionsInputSchema>;

export interface SubscriptionsData {
  totalResults?: number;
  subscriptions: Subscription[];
}

const DESCRIPTION =
  "List the channels the user is subscribed to. This tool requires prior authorization: if it returns not_authorized, the user must run the authorize action. `maxResults` defaults to 25 (maximum 50). `order` may be alphabetical, relevance, or unread — there is no newest-first order, so `publishedAt` (the time the user subscribed) cannot be used to find recent subscriptions. `channelId` checks whether the user is subscribed to one specific channel. `totalResults` is an approximation, not an exact count.";

export const youtubeSubscriptions: Tool<SubscriptionsInput, SubscriptionsData> = {
  name: "youtube_subscriptions",
  description: DESCRIPTION,
  promptSnippet: "List the channels the user is subscribed to (requires authorization)",
  promptGuidelines: [
    "Use youtube_subscriptions when the user asks which channels they subscribe to. It needs authorization first.",
  ],
  parameters: subscriptionsInputSchema,

  async execute(input, context): Promise<ToolResult<SubscriptionsData>> {
    const auth = await resolveOAuthAuth({
      agentDir: context.agentDir,
      env: process.env,
      fetchFn: context.fetchFn,
      signal: context.signal,
    });
    if (!auth.ok) return { ok: false, error: auth.error, fields: failureFields() };

    const maxResults = clampResults(input.maxResults, 25, 1, 50);
    const result = await getSubscriptions(
      {
        maxResults,
        ...(input.order ? { order: input.order } : {}),
        ...(input.channelId ? { channelId: input.channelId } : {}),
      },
      { auth: auth.auth, fetchFn: context.fetchFn, signal: context.signal },
    );
    if (!result.ok) return { ok: false, error: result.error, fields: failureFields() };

    const data: SubscriptionsData = { subscriptions: result.data.subscriptions };
    if (typeof result.data.totalResults === "number") data.totalResults = result.data.totalResults;

    return {
      ok: true,
      data,
      fields: { truncated: false, spilled: [], records: result.data.subscriptions.length },
    };
  },
};
