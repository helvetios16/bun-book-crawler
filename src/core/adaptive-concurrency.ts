/**
 * @file adaptive-concurrency.ts
 * @description AIMD-style controller that adapts pMap's concurrency limit to the
 * observed success/failure rate of requests: halves the limit immediately on a 429
 * (multiplicative decrease) and eases it back up by one after a streak of successes
 * (additive increase), instead of scraping at a fixed concurrency regardless of load.
 */
import {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  CONCURRENCY_SUCCESS_THRESHOLD,
} from "../config/constants";
import { Logger } from "../utils/logger";

const log = new Logger("AdaptiveConcurrency");

/**
 * The subset of the controller that pMap actually depends on. Kept as a separate
 * interface (rather than referencing the class directly) so callers/tests can pass
 * in a plain object without fighting TypeScript's nominal typing of private fields.
 */
export interface ConcurrencyLimiter {
  readonly max: number;
  getLimit(): number;
}

export class AdaptiveConcurrencyController implements ConcurrencyLimiter {
  public readonly max: number;
  private readonly min: number;
  private readonly successThreshold: number;
  private limit: number;
  private consecutiveSuccesses = 0;

  constructor(
    max: number = CONCURRENCY_MAX,
    min: number = CONCURRENCY_MIN,
    successThreshold: number = CONCURRENCY_SUCCESS_THRESHOLD,
  ) {
    this.max = max;
    this.min = min;
    this.successThreshold = successThreshold;
    this.limit = max;
  }

  /** Current allowed concurrency. */
  getLimit(): number {
    return this.limit;
  }

  /** Call after a request completes successfully (2xx / not-modified). */
  reportSuccess(): void {
    if (this.limit >= this.max) {
      return;
    }
    this.consecutiveSuccesses++;
    if (this.consecutiveSuccesses >= this.successThreshold) {
      this.consecutiveSuccesses = 0;
      this.limit++;
      log.debug(
        `Concurrencia aumentada a ${this.limit}/${this.max} tras ${this.successThreshold} éxitos consecutivos.`,
      );
    }
  }

  /** Call after a 429 (rate limited) response, whether from HTTP or the browser fallback. */
  reportThrottled(): void {
    this.consecutiveSuccesses = 0;
    const previous = this.limit;
    this.limit = Math.max(this.min, Math.floor(this.limit / 2));
    if (this.limit !== previous) {
      log.warn(
        `Rate limit (429) detectado. Reduciendo concurrencia de ${previous} a ${this.limit}.`,
      );
    }
  }
}
