/**
 * Pi package entrypoint.
 *
 * `package.json` declares `pi.extensions: ["./extensions"]`, so Pi loads this
 * file. The implementation lives in `adapters/pi/`; the rest of the package
 * (`tools/`, `adapters/mcp`, `adapters/portable`) is agent-agnostic.
 */
export { default } from "../adapters/pi/index.ts";
