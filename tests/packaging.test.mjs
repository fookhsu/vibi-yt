import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Packaging smoke test.
 *
 * Node refuses to strip TypeScript types for files under `node_modules`
 * (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). A tarball whose runtime
 * entrypoints import `.ts` therefore works from a local checkout but breaks for
 * every installed consumer. In-repo tests cannot catch that: they import sources
 * by path, outside `node_modules`.
 *
 * So this test packs the package and installs it into a throwaway
 * `node_modules/vibi-yt`, then drives it the way a real consumer would. The
 * `node_modules` path component is essential — extracting to a plain directory
 * silently re-enables type stripping and the test would pass against a broken
 * package.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageName = "vibi-yt";

function packTarball(destination) {
  const output = execFileSync("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  // `npm pack --json` returns an array on npm >= 10 and an object keyed by
  // package name on older npm, so CI and a local checkout can disagree.
  const parsed = JSON.parse(output);
  const [entry] = Array.isArray(parsed) ? parsed : Object.values(parsed);
  const filename = entry?.filename;
  if (typeof filename !== "string") {
    throw new Error(`Unexpected npm pack output: ${output}`);
  }

  const tarball = join(destination, filename);
  if (!existsSync(tarball)) {
    throw new Error(`npm pack reported ${filename} but it does not exist`);
  }
  return tarball;
}

/** Install the packed tarball as `<workspace>/node_modules/vibi-yt`. */
async function installTarballInto(workspace, tarball) {
  const nodeModules = join(workspace, "node_modules");
  await mkdir(nodeModules, { recursive: true });

  // Reuse the repo's installed dependencies so the test stays offline.
  for (const entry of await readdir(join(repoRoot, "node_modules"), { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".package-lock.json") continue;
    await symlink(
      join(repoRoot, "node_modules", entry.name),
      join(nodeModules, entry.name),
      entry.isDirectory() ? "dir" : "file",
    );
  }

  const pkgDir = join(nodeModules, packageName);
  await mkdir(pkgDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "--strip-components=1", "-C", pkgDir]);
  return pkgDir;
}

function runNode(cwd, source) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd,
    encoding: "utf8",
  });
}

test("packed tarball is importable by plain Node.js", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "vibi-pack-"));

  try {
    const pkgDir = await installTarballInto(workspace, packTarball(workspace));

    const result = runNode(
      workspace,
      `const m = await import(${JSON.stringify(packageName)});
       const p = await import(${JSON.stringify(`${packageName}/adapters/portable`)});
       console.log(m.youtubeTools.map((t) => t.name).join(","));
       console.log(typeof p.toOpenAiTools);`,
    );

    assert.equal(
      result.status,
      0,
      `published package failed to import under plain Node:\n${result.stderr}`,
    );
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "youtube_search,youtube_video_details,youtube_transcript",
      "function",
    ]);
    assert.ok(pkgDir.endsWith(join("node_modules", packageName)));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("packed bin speaks MCP over stdio from node_modules", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "vibi-pack-"));

  try {
    const pkgDir = await installTarballInto(workspace, packTarball(workspace));

    const result = spawnSync(process.execPath, [join(pkgDir, "bin", "mcp.mjs")], {
      input: `${[
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      ].join("\n")}\n`,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, `published bin failed:\n${result.stderr}`);

    const [initialized, listed] = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    // Guards the class of bug where the build changes module depth and a
    // relative path such as `../../package.json` silently stops resolving.
    const installedVersion = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8")).version;
    assert.equal(
      initialized.result.serverInfo.version,
      installedVersion,
      "published serverInfo.version must match the installed package.json",
    );

    assert.deepEqual(
      listed.result.tools.map((tool) => tool.name),
      ["youtube_search", "youtube_video_details", "youtube_transcript"],
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
