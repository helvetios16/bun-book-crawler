/**
 * @file error-classifier.ts
 * @description Buckets scraper error messages into stable categories, so a wave
 * of failures (WAF, rate limiting, a stale session) can be told apart at a
 * glance from unrelated one-off parse failures, without hand-reading every
 * message in the final error list.
 */

export type ErrorCategory =
  | "session_init"
  | "waf_timeout"
  | "captcha_redirect"
  | "rate_limited"
  | "blocked"
  | "no_response"
  | "parse_failure"
  | "validation_failed"
  | "unknown";

// Order matters: browser-fallback errors wrap an inner cause in their message
// (e.g. "Browser fallback failed for <url> after 3 attempts: <inner>"), so
// matching happens by substring anywhere in the message, most specific first.
const RULES: [ErrorCategory, RegExp][] = [
  ["session_init", /SESSION_INIT_FAILURE/],
  ["waf_timeout", /WAF challenge did not resolve/i],
  ["captcha_redirect", /login or captcha/i],
  ["rate_limited", /Status: 429/],
  ["blocked", /Status: 403/],
  ["no_response", /No response received from browser/i],
  ["parse_failure", /Failed to get details for book/i],
  ["validation_failed", /returned content that failed validation/i],
];

export function classifyError(message: string): ErrorCategory {
  for (const [category, pattern] of RULES) {
    if (pattern.test(message)) {
      return category;
    }
  }
  return "unknown";
}
