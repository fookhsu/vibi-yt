/**
 * A tiny per-path mutation queue.
 *
 * G4 decided credential writes must be serialized, and ADR 0002 forbids core
 * from importing the Pi SDK (which exports `withFileMutationQueue`). This is
 * the same contract, owned by core.
 */

import path from "node:path";

const queues = new Map<string, Promise<void>>();

export function withFileMutationQueue<T>(filePath: string, fn: () => Promise<T> | T): Promise<T> {
  const key = path.resolve(filePath);
  const prior = queues.get(key) ?? Promise.resolve();
  const run = prior.then(() => fn());
  const guard: Promise<void> = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, guard);
  void guard.then(() => {
    if (queues.get(key) === guard) queues.delete(key);
  });
  return run;
}
