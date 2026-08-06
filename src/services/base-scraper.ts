import type { Page } from "puppeteer";
import {
  GOODREADS_URL,
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRIES,
  NAVIGATION_TIMEOUT_MS,
  RETRY_BACKOFF_MULTIPLIER,
  SESSION_COOKIE_POLL_INTERVAL_MS,
  SESSION_TTL_MINUTES,
  WAF_CHALLENGE_TIMEOUT_MS,
} from "../config/constants";
import { AdaptiveConcurrencyController } from "../core/adaptive-concurrency";
import type { BrowserClient } from "../core/browser-client";
import { CacheManager } from "../core/cache-manager";
import { DatabaseService } from "../core/database";
import { HttpClient } from "../core/http-client";
import { RateLimiter } from "../core/rate-limiter";
import { Logger } from "../utils/logger";
import { delay, getErrorMessage, hashUrl } from "../utils/util";

const log = new Logger("BaseScraperService");

export interface ScraperStats {
  httpSuccess: number;
  browserFallback: number;
  cacheHits: number;
  notModified: number;
}

export abstract class BaseScraperService {
  protected http: HttpClient | null = null;
  protected readonly cache = new CacheManager();
  protected readonly db = new DatabaseService();
  protected readonly rateLimiter = new RateLimiter();
  /** Shared with pMap-driven work (e.g. edition pagination) so it backs off on 429s. */
  protected readonly concurrency = new AdaptiveConcurrencyController();

  /** In-flight session initialization, shared so concurrent fetches log in only once. */
  private sessionInitPromise: Promise<void> | null = null;

  protected stats: ScraperStats = {
    httpSuccess: 0,
    browserFallback: 0,
    cacheHits: 0,
    notModified: 0,
  };

  constructor(protected readonly browserClient?: BrowserClient) {}

  public async initSession(): Promise<void> {
    if (this.http) {
      return;
    }
    if (!this.sessionInitPromise) {
      this.sessionInitPromise = this.createSession().finally(() => {
        this.sessionInitPromise = null;
      });
    }
    return this.sessionInitPromise;
  }

  private async createSession(): Promise<void> {
    const latestSession = this.db.getLatestSession();

    if (latestSession && this.isSessionFresh(latestSession.createdAt)) {
      log.debug("Reusing existing session from database.");
      this.http = new HttpClient(latestSession.cookies);
      return;
    }

    log.info("Session expired or missing. Fetching new cookies...");

    if (!this.browserClient) {
      throw new Error("BrowserClient required to initialize a session.");
    }

    // A single transient block/redirect/timeout from Goodreads must not abort the
    // whole pipeline, so retry the cookie acquisition with exponential backoff.
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const cookiesStr = await this.acquireSessionCookies();
        this.db.saveSession(cookiesStr);
        this.http = new HttpClient(cookiesStr);
        log.info("New session initialized.");
        return;
      } catch (error: unknown) {
        lastError = error;
        log.warn(`Session attempt ${attempt}/${MAX_RETRIES} failed: ${getErrorMessage(error)}`);
        if (attempt < MAX_RETRIES) {
          await delay(INITIAL_RETRY_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** (attempt - 1));
        }
      }
    }

    // Surface the underlying cause: callers (and the grid reporter) only print the
    // thrown message, so the real reason must travel with it.
    log.error("Critical session error:", getErrorMessage(lastError));
    throw new Error(
      `SESSION_INIT_FAILURE: Could not obtain a valid Goodreads session after ${MAX_RETRIES} attempts. Cause: ${getErrorMessage(lastError)}`,
    );
  }

  /**
   * Opens a throwaway Puppeteer page on Goodreads and returns its cookie header.
   * Rejects on block/captcha/login redirects so a poisoned session is never saved.
   */
  private async acquireSessionCookies(): Promise<string> {
    if (!this.browserClient) {
      throw new Error("BrowserClient required to initialize a session.");
    }

    const page = await this.browserClient.launch();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    try {
      const response = await page.goto(GOODREADS_URL, { waitUntil: "domcontentloaded" });
      const status = response?.status();
      if (status === 403 || status === 429) {
        throw new Error(`Goodreads blocked the session request (Status: ${status}).`);
      }

      const currentUrl = page.url();
      if (currentUrl.includes("/user/sign_in") || currentUrl.includes("captcha")) {
        throw new Error("Goodreads redirected to login/captcha during session init.");
      }

      const cookiesStr = await this.waitForCookies(page);
      if (!cookiesStr) {
        throw new Error("No cookies obtained from browser.");
      }

      return cookiesStr;
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Goodreads responds to the first hit with an AWS WAF JS challenge (HTTP 202,
   * empty body) and only sets cookies once that challenge script finishes running,
   * which happens after `domcontentloaded`. Poll instead of reading cookies once.
   */
  private async waitForCookies(page: Page): Promise<string> {
    const deadline = Date.now() + WAF_CHALLENGE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const cookiesArr = await page.cookies();
      if (cookiesArr.length > 0) {
        return cookiesArr.map((c) => `${c.name}=${c.value}`).join("; ");
      }
      await delay(SESSION_COOKIE_POLL_INTERVAL_MS);
    }
    return "";
  }

  private isSessionFresh(createdAt: string): boolean {
    const createdDate = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins < SESSION_TTL_MINUTES;
  }

  protected async fetchContentWithFallback(
    url: string,
    validate?: (content: string) => boolean,
  ): Promise<{ content: string; method: "http" | "browser" | "not-modified" }> {
    if (!this.http) {
      await this.initSession();
    }
    await this.rateLimiter.throttle();

    try {
      const urlHash = hashUrl(url);
      const metadata = this.db.getHttpMetadata(urlHash);

      if (metadata && (metadata.etag || metadata.lastModified)) {
        const condResponse = await this.http?.conditionalGet(url, {
          etag: metadata.etag,
          lastModified: metadata.lastModified,
        });

        if (condResponse?.status === 429) {
          this.concurrency.reportThrottled();
        }

        if (condResponse?.notModified) {
          const cached =
            (await this.cache.get(url, ".json")) || (await this.cache.get(url, ".html"));
          if (cached && (!validate || validate(cached))) {
            this.stats.notModified++;
            this.concurrency.reportSuccess();
            this.db.refreshHttpMetadata(urlHash);
            return { content: cached, method: "not-modified" };
          }
        }

        if (
          condResponse?.content &&
          !this.http?.isBlocked(condResponse.content) &&
          (!validate || validate(condResponse.content))
        ) {
          this.stats.httpSuccess++;
          this.concurrency.reportSuccess();
          this.db.saveHttpMetadata(urlHash, url, condResponse.etag, condResponse.lastModified);
          return { content: condResponse.content, method: "http" };
        }
      }

      const content = await this.http?.get(url, undefined, {
        onRetryableStatus: (status) => {
          if (status === 429) {
            this.concurrency.reportThrottled();
          }
        },
      });
      if (content && !this.http?.isBlocked(content) && (!validate || validate(content))) {
        this.stats.httpSuccess++;
        this.concurrency.reportSuccess();
        this.saveMetadataFromUrl(url);
        return { content, method: "http" };
      }
    } catch (error: unknown) {
      log.debug("HTTP fetch failed, falling back to browser:", getErrorMessage(error));
    }

    this.stats.browserFallback++;
    const content = await this.fetchViaBrowserWithRetry(url, validate);
    this.concurrency.reportSuccess();
    return { content, method: "browser" };
  }

  /**
   * The Puppeteer fallback is the last line of defense, so a single transient
   * WAF challenge/captcha page must not permanently fail the item — retry with
   * backoff the same way HttpClient.get() and session init already do.
   *
   * Real blocks are already caught inside navigateTo (403/429 status, redirects
   * to sign-in/captcha, unresolved WAF challenge). HttpClient.isBlocked() is not
   * used here: it substring-matches raw HTTP bodies for words like "robot", and
   * fully rendered Goodreads pages legitimately contain that word (e.g. the
   * standard `<meta name="robots">` tag), which made it flag real pages as
   * blocked. `validate` is the reliable positive-content signal instead.
   */
  private async fetchViaBrowserWithRetry(
    url: string,
    validate?: (content: string) => boolean,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const content = await this.fetchViaBrowser(url);
        if (validate && !validate(content)) {
          throw new Error("Browser fallback returned content that failed validation.");
        }
        return content;
      } catch (error: unknown) {
        lastError = error;
        log.warn(
          `Browser fallback attempt ${attempt}/${MAX_RETRIES} failed for ${url}: ${getErrorMessage(error)}`,
        );
        if (attempt < MAX_RETRIES) {
          await delay(INITIAL_RETRY_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** (attempt - 1));
        }
      }
    }
    throw new Error(
      `Browser fallback failed for ${url} after ${MAX_RETRIES} attempts: ${getErrorMessage(lastError)}`,
    );
  }

  private async saveMetadataFromUrl(url: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": this.http ? "bukcraw" : "" },
      });
      const etag = response.headers.get("ETag") || undefined;
      const lastModified = response.headers.get("Last-Modified") || undefined;
      if (etag || lastModified) {
        this.db.saveHttpMetadata(hashUrl(url), url, etag, lastModified);
      }
    } catch {}
  }

  /**
   * Fetches a URL through a dedicated Puppeteer page. A fresh page is created per
   * call and closed afterwards, so concurrent browser fallbacks never share (and
   * detach) the same frame.
   */
  protected async fetchViaBrowser(url: string): Promise<string> {
    if (!this.browserClient) {
      throw new Error("BrowserClient required for Puppeteer fallback.");
    }

    const page = await this.browserClient.launch();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    try {
      await this.navigateTo(page, url);
      return await page.content();
    } finally {
      await page.close().catch(() => {});
    }
  }

  protected async navigateTo(page: Page, url: string): Promise<void> {
    let response = await page.goto(url, { waitUntil: "domcontentloaded" });
    if (!response) {
      throw new Error("No response received from browser.");
    }

    if (response.status() === 202) {
      // AWS WAF JS challenge: the page reloads itself once the challenge script
      // finishes, destroying this navigation's execution context. Reading
      // page.content() before that reload just captures the empty challenge
      // shell, so wait for the reload instead (mirrors waitForCookies above).
      response = await page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: WAF_CHALLENGE_TIMEOUT_MS })
        .catch(() => null);
      if (!response) {
        throw new Error("Goodreads WAF challenge did not resolve in time.");
      }
    }

    const status = response.status();
    if (status === 404) {
      return;
    }
    if (status === 403 || status === 429) {
      if (status === 429) {
        this.concurrency.reportThrottled();
      }
      throw new Error(`Access denied or rate limited (Status: ${status}).`);
    }

    const currentUrl = page.url();
    if (currentUrl.includes("/user/sign_in") || currentUrl.includes("captcha")) {
      throw new Error("Redirected to login or captcha page. Manual intervention required.");
    }
    await page.waitForSelector("body");
  }

  public getTelemetry(): ScraperStats {
    return this.stats;
  }
}
