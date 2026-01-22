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
