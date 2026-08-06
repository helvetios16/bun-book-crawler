/**
 * @file concurrency.ts
 * @description Controlled concurrency utility for parallel processing with a limit.
 */

import { CONCURRENCY_POLL_INTERVAL_MS } from "../config/constants";
import type { ConcurrencyLimiter } from "../core/adaptive-concurrency";
import { delay } from "./util";

/**
 * Maps over an array with controlled concurrency, similar to p-map.
 * @param items - The array of items to process.
 * @param mapper - Async function to apply to each item.
 * @param concurrency - Either a fixed max concurrency, or a ConcurrencyLimiter (e.g.
 *   AdaptiveConcurrencyController) whose limit is re-checked between items so it can
 *   be lowered/raised mid-flight.
 * @returns Array of results in the same order as the input.
 */
export async function pMap<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number | ConcurrencyLimiter,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let active = 0;

  const maxWorkers = typeof concurrency === "number" ? concurrency : concurrency.max;
  const getLimit = () => (typeof concurrency === "number" ? concurrency : concurrency.getLimit());

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      while (active >= getLimit()) {
        await delay(CONCURRENCY_POLL_INTERVAL_MS);
      }
      const index = nextIndex++;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      active++;
      try {
        results[index] = await mapper(item, index);
      } finally {
        active--;
      }
    }
  }

  const workers = Array.from({ length: Math.min(maxWorkers, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
