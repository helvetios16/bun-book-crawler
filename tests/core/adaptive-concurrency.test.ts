import { describe, expect, test } from "bun:test";
import { AdaptiveConcurrencyController } from "../../src/core/adaptive-concurrency";

describe("AdaptiveConcurrencyController", () => {
  test("starts at max concurrency", () => {
    const controller = new AdaptiveConcurrencyController(3, 1, 5);
    expect(controller.getLimit()).toBe(3);
  });

  test("halves the limit on a throttled report", () => {
    const controller = new AdaptiveConcurrencyController(8, 1, 5);
    controller.reportThrottled();
    expect(controller.getLimit()).toBe(4);
  });

  test("never drops below the configured minimum", () => {
    const controller = new AdaptiveConcurrencyController(3, 1, 5);
    controller.reportThrottled();
    controller.reportThrottled();
    controller.reportThrottled();
    expect(controller.getLimit()).toBe(1);
  });

  test("does not raise the limit before the success threshold is reached", () => {
    const controller = new AdaptiveConcurrencyController(4, 1, 3);
    controller.reportThrottled(); // limit -> 2
    controller.reportSuccess();
    controller.reportSuccess();
    expect(controller.getLimit()).toBe(2);
  });

  test("raises the limit by one after enough consecutive successes", () => {
    const controller = new AdaptiveConcurrencyController(4, 1, 3);
    controller.reportThrottled(); // limit -> 2
    controller.reportSuccess();
    controller.reportSuccess();
    controller.reportSuccess();
    expect(controller.getLimit()).toBe(3);
  });

  test("never raises the limit past max", () => {
    const controller = new AdaptiveConcurrencyController(2, 1, 1);
    controller.reportSuccess();
    controller.reportSuccess();
    controller.reportSuccess();
    expect(controller.getLimit()).toBe(2);
  });

  test("a throttled report resets the success streak", () => {
    const controller = new AdaptiveConcurrencyController(4, 1, 3);
    controller.reportThrottled(); // limit -> 2
    controller.reportSuccess();
    controller.reportSuccess();
    controller.reportThrottled(); // streak reset, limit -> 1
    controller.reportSuccess();
    controller.reportSuccess();
    expect(controller.getLimit()).toBe(1);
  });

  test("uses default constants when no args provided", () => {
    const controller = new AdaptiveConcurrencyController();
    expect(controller).toBeTruthy();
    expect(controller.getLimit()).toBe(controller.max);
  });
});
