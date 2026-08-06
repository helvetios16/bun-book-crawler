// src/config/constants.ts

/**
 * Options for launching Puppeteer browser.
 * Combines default arguments with headless mode setting.
 */
export const PUPPETEER_LAUNCH_OPTIONS = {
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
  ],
};

/**
 * User agent string to mimic a real browser.
 */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * User agent metadata for client hints, enhancing anti-detection.
 */
export const USER_AGENT_METADATA = {
  brands: [
    { brand: "Google Chrome", version: "131" },
    { brand: "Chromium", version: "131" },
    { brand: "Not_A Brand", version: "24" },
  ],
  fullVersion: "131.0.0.0",
  platform: "Windows",
  platformVersion: "10.0.0",
  architecture: "x86",
  model: "",
  mobile: false,
};

/**
 * Target URL for scraping.
 */
export const GOODREADS_URL = "https://www.goodreads.com";
export const BOOK_URL = "/book/show/";
export const BLOG_URL = "/blog/show/";
export const WORK_URL = "/work/editions/";
export const SEARCH_PARAMS =
  "?utf8=✓&sort=num_ratings&filter_by_format=Kindle+Edition&filter_by_language=spa";

// --- Timing & TTL Configuration ---

/** How long (in minutes) before a stored session is considered stale */
export const SESSION_TTL_MINUTES = 20;

/** How many days a cached record in the database is considered fresh */
export const CACHE_TTL_DAYS = 10;

/** Base delay (ms) between scraping requests for respectful crawling */
export const SCRAPING_DELAY_BASE_MS = 2500;

/** Additional random jitter (ms) added to the base delay */
export const SCRAPING_DELAY_JITTER_MS = 2500;

/** Default navigation timeout (ms) for Puppeteer pages */
export const NAVIGATION_TIMEOUT_MS = 60000;

/** How many days the file-based cache looks back when searching for cached content */
export const FILE_CACHE_LOOKBACK_DAYS = 3;

/**
 * Goodreads gates first visits (and occasionally regular page loads) behind an
 * AWS WAF JS challenge (HTTP 202, empty body) that resolves after a few seconds
 * of client-side execution and then self-triggers a reload. Session init polls
 * for cookies during that window; regular navigations wait for the reload.
 */
export const WAF_CHALLENGE_TIMEOUT_MS = 10000;
export const SESSION_COOKIE_POLL_INTERVAL_MS = 500;

// --- HTTP Retry Configuration ---

/** Maximum number of retry attempts for failed HTTP requests */
export const MAX_RETRIES = 3;

/** Initial delay (ms) before the first retry */
export const INITIAL_RETRY_DELAY_MS = 1000;

/** Multiplier applied to the delay on each subsequent retry */
export const RETRY_BACKOFF_MULTIPLIER = 2;

/** HTTP status codes that should trigger a retry */
export const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504] as const;

// --- Adaptive Concurrency Configuration ---

/** Starting/ceiling concurrency for pMap-driven work (e.g. edition pagination) */
export const CONCURRENCY_MAX = 3;

/** Floor the adaptive controller will never throttle below, even under sustained 429s */
export const CONCURRENCY_MIN = 1;

/** Consecutive successful requests required before easing the limit back up by one */
export const CONCURRENCY_SUCCESS_THRESHOLD = 5;

/** Poll interval (ms) pMap workers use while waiting for a free adaptive concurrency slot */
export const CONCURRENCY_POLL_INTERVAL_MS = 200;
