import fs from "node:fs";

/** Read and parse a JSON file, returning `undefined` instead of throwing. */
export function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}
