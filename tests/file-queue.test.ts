import { test } from "node:test";
import assert from "node:assert/strict";

import { withFileMutationQueue } from "../lib/file-queue.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("withFileMutationQueue serializes mutations of the same path", async () => {
  const order: string[] = [];
  const a = withFileMutationQueue("/tmp/vibi-x.json", async () => {
    order.push("a-start");
    await sleep(20);
    order.push("a-end");
  });
  const b = withFileMutationQueue("/tmp/vibi-x.json", async () => {
    order.push("b-start");
    await sleep(1);
    order.push("b-end");
  });
  await Promise.all([a, b]);
  assert.deepEqual(order, ["a-start", "a-end", "b-start", "b-end"]);
});

test("withFileMutationQueue does not serialize different paths", async () => {
  const order: string[] = [];
  await Promise.all([
    withFileMutationQueue("/tmp/vibi-a.json", async () => {
      order.push("a-start");
      await sleep(15);
      order.push("a-end");
    }),
    withFileMutationQueue("/tmp/vibi-b.json", async () => {
      order.push("b-start");
      await sleep(1);
      order.push("b-end");
    }),
  ]);
  assert.deepEqual(order, ["a-start", "b-start", "b-end", "a-end"]);
});

test("a failing mutation releases the queue for the next one", async () => {
  await assert.rejects(
    withFileMutationQueue("/tmp/vibi-c.json", async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  const value = await withFileMutationQueue("/tmp/vibi-c.json", async () => 42);
  assert.equal(value, 42);
});
