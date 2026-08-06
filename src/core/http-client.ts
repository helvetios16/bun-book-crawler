// src/core/http-client.ts

import {
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRIES,
  RETRY_BACKOFF_MULTIPLIER,
  RETRYABLE_STATUS_CODES,
  USER_AGENT,
} from "../config/constants";
import { delay } from "../utils/util";

/**
 * Interface for custom HTTP headers.
 */
interface HttpHeaders {
  readonly "User-Agent": string;
  readonly Accept: string;
  readonly "Accept-Language": string;
  readonly "Accept-Encoding"?: string;
  readonly "Cache-Control": string;
  readonly Pragma: string;
  readonly "Sec-Fetch-Dest": string;
  readonly "Sec-Fetch-Mode": string;
  readonly "Sec-Fetch-Site": string;
  readonly "Sec-Fetch-User": string;
  readonly "Upgrade-Insecure-Requests": string;
  readonly Referer: string;
  readonly Cookie?: string;
}

/**
 * Options for the HTTP request.
 */
interface RequestOptions {
  readonly headers?: HttpHeaders;
  readonly method?: "GET" | "POST";
}

/**
 * Hooks for observing retry-worthy responses without changing retry behavior itself.
 * Lets callers (e.g. an adaptive concurrency controller) react to rate limiting.
 */
export interface RequestHooks {
  onRetryableStatus?: (status: number) => void;
}

/**
 * Conditional headers sent to check if a resource has been modified.
 */
export interface ConditionalHeaders {
  etag?: string;
  lastModified?: string;
}

/**
 * Response from a conditional GET, including cache-validation metadata.
 */
export interface ConditionalResponse {
  content: string | null;
  status: number;
  notModified: boolean;
  etag?: string;
  lastModified?: string;
}

/**
 * A lightweight HTTP client using Bun's fetch API.
 * Optimized for scraping Goodreads by mimicking browser headers.
 */
export class HttpClient {
  private readonly cookies: string;
  private readonly defaultHeaders: HttpHeaders;

  constructor(cookies = "") {
    this.cookies = cookies;
    this.defaultHeaders = {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,webp,application/json,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      Referer: "https://www.google.com/",
    };

    if (this.cookies) {
      const headersWithCookie: HttpHeaders = { ...this.defaultHeaders, Cookie: this.cookies };
      this.defaultHeaders = headersWithCookie;
    }
  }

  /**
   * Performs a GET request with automatic retry and exponential backoff.
   * Retries on transient errors (429, 5xx) with jitter to avoid thundering herd.
   * @param url - The target URL.
   * @param options - Optional request configuration.
   * @returns The response body as a string.
   */
  public async get(url: string, options?: RequestOptions, hooks?: RequestHooks): Promise<string> {
    const headers = { ...this.defaultHeaders, ...options?.headers };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: options?.method ?? "GET",
          headers,
        });

        if (!response.ok) {
          const status = response.status;
          if (
            attempt < MAX_RETRIES &&
            RETRYABLE_STATUS_CODES.includes(status as 429 | 500 | 502 | 503 | 504)
          ) {
            hooks?.onRetryableStatus?.(status);
            const retryAfter = response.headers.get("Retry-After");
            const backoff = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : INITIAL_RETRY_DELAY_MS *
                RETRY_BACKOFF_MULTIPLIER ** attempt *
                (0.5 + Math.random());
            await delay(backoff);
            continue;
          }
          throw new Error(`HTTP Error: ${status} ${response.statusText} at ${url}`);
        }

        return await response.text();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          const backoff =
            INITIAL_RETRY_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** attempt * (0.5 + Math.random());
          await delay(backoff);
        }
      }
    }

    throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries: ${lastError?.message}`);
  }

  /**
   * Performs a conditional GET using ETag/Last-Modified headers.
   * Returns 304 (notModified=true) when the resource hasn't changed,
   * avoiding a full download of unchanged pages.
   */
  public async conditionalGet(
    url: string,
    cached?: ConditionalHeaders,
  ): Promise<ConditionalResponse> {
    const conditionalHeaders: Record<string, string> = {};
    if (cached?.etag) {
      conditionalHeaders["If-None-Match"] = cached.etag;
    }
    if (cached?.lastModified) {
      conditionalHeaders["If-Modified-Since"] = cached.lastModified;
    }

    const headers = { ...this.defaultHeaders, ...conditionalHeaders };

    try {
      const response = await fetch(url, { method: "GET", headers });

      const etag = response.headers.get("ETag") || undefined;
      const lastModified = response.headers.get("Last-Modified") || undefined;

      if (response.status === 304) {
        return { content: null, status: 304, notModified: true, etag, lastModified };
      }

      if (!response.ok) {
        return {
          content: null,
          status: response.status,
          notModified: false,
          etag,
          lastModified,
        };
      }

      const content = await response.text();
      return { content, status: response.status, notModified: false, etag, lastModified };
    } catch {
      return { content: null, status: 0, notModified: false };
    }
  }

  /**
   * Checks if the content indicates a CAPTCHA or bot detection.
   * @param html - The HTML content to analyze.
   * @returns True if a CAPTCHA or block is detected.
   */
  public isBlocked(html: string): boolean {
    const lowerHtml = html.toLowerCase();
    return (
      lowerHtml.includes("captcha") ||
      lowerHtml.includes("robot") ||
      lowerHtml.includes("verify you are a human") ||
      lowerHtml.includes("hcaptcha") ||
      lowerHtml.includes("recaptcha")
    );
  }
}
