/**
 * Pi presentation of a core `ToolResult`.
 *
 * Core returns data plus render fields; this file decides how a Pi user and
 * the model read them. It must never drop `truncated` or `spilled` — those are
 * facts, not optional prose.
 */

import type { FailureCode, RenderFields, ToolResult } from "../../tools/types.ts";

/**
 * Host-specific pointers for failures whose remedy is a Pi command. Core keeps
 * hints host-neutral (command names belong to the host, per CONTEXT.md).
 */
const HOST_HINTS: Partial<Record<FailureCode, string>> = {
  not_authorized: "In Pi: /youtube:authorize, or /youtube:set-api-key for the API-key tools.",
  client_config_invalid: "In Pi: set YOUTUBE_OAUTH_CLIENT_JSON, then run /youtube:authorize.",
  redirect_uri_mismatch: "In Pi: fix the registered redirect in Google Cloud, then run /youtube:authorize again.",
  port_in_use: "In Pi: free the redirect port, then run /youtube:authorize again.",
  service_disabled: "In Pi: enable YouTube Data API v3, then retry.",
};

export function renderFieldsBlock(fields: RenderFields): string {
  const lines = [`truncated: ${fields.truncated}`];
  if (fields.records !== undefined) lines.push(`records: ${fields.records}`);
  for (const spill of fields.spilled) {
    lines.push(`spilled: ${spill.path} (${spill.bytes} bytes, ${spill.lines} lines)`);
  }
  if (fields.preview !== undefined) {
    lines.push("preview:", fields.preview);
  }
  return lines.join("\n");
}

export function renderResultText(result: ToolResult<unknown>): string {
  if (!result.ok) {
    const retryable = result.error.retryable ? "yes" : "no";
    const hostHint = HOST_HINTS[result.error.code];
    const lines = [
      `FAILED ${result.error.code}: ${result.error.hint} (retryable: ${retryable})`,
    ];
    if (hostHint) lines.push(hostHint);
    return `${lines.join("\n")}\n\n${renderFieldsBlock(result.fields)}`;
  }
  return `${JSON.stringify(result.data, null, 2)}\n\n${renderFieldsBlock(result.fields)}`;
}
