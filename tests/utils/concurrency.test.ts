import { describe, expect, test } from "bun:test";
import { AdaptiveConcurrencyController } from "../../src/core/adaptive-concurrency";
import { pMap } from "../../src/utils/concurrency";

describe("pMap - fixed concurrency", () => {
  test("maps all items and preserves order", async () => {
    const results = await pMap([1, 2, 3, 4, 5], async (n) => n * 2, 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  test("never runs more than the given concurrency at once", async () => {
    let active = 0;
    let maxActive = 0;

    await pMap(
      Array.from({ length: 10 }, (_, i) => i),
      async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return n;
      },
      3,
    );

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  test("handles an empty array", async () => {
    const results = await pMap([], async (n: number) => n, 3);
    expect(results).toEqual([]);
  });
});

describe("pMap - AdaptiveConcurrencyController", () => {
  test("respects the controller's initial limit", async () => {
    const controller = new AdaptiveConcurrencyController(2, 1, 5);
    let active = 0;
    let maxActive = 0;

    await pMap(
      Array.from({ length: 8 }, (_, i) => i),
      async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return n;
      },
      controller,
    );

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test("lowering the limit mid-flight caps concurrency for items started afterwards", async () => {
    // A minimal stand-in for AdaptiveConcurrencyController: only `max`/`getLimit()`
    // matter to pMap. The limit is dropped as soon as the 4th item starts, i.e.
    // while the first batch is still in flight — those in-flight items are expected
    // to keep running (throttling only gates *new* work), so only items started
    // after the drop are checked against the new cap.
    let limit = 4;
    const fakeController = { max: 4, getLimit: () => limit };

    let active = 0;
    let started = 0;
    let droppedAtStart = -1;
    let maxActiveAfterDrop = 0;

    await pMap(
      Array.from({ length: 6 }, (_, i) => i),
      async (n) => {
        const myStart = started++;
        active++;
        if (myStart === 3) {
          limit = 2;
          droppedAtStart = myStart;
        }
        if (droppedAtStart !== -1 && myStart > droppedAtStart) {
          maxActiveAfterDrop = Math.max(maxActiveAfterDrop, active);
        }
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return n;
      },
      fakeController,
    );

    expect(maxActiveAfterDrop).toBeLessThanOrEqual(2);
  });
});
