/**
 * Pi package entrypoint.
 *
 * `package.json` declares `pi.extensions: ["./extensions"]`, so Pi loads this
 * file. The adapter lives in `adapters/pi/`; `lib/` and `tools/` are
 * agent-neutral.
 */

export { default } from "../adapters/pi/index.ts";
