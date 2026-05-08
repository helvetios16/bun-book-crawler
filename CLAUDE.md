# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the full pipeline (Blog → Books → Editions)
bun run pipeline -- <blogId1> [blogId2...] [--language=spa] [--format=ebook,Kindle Edition] [--sort=num_ratings] [--report]

# Via CLI binary
bun run src/cli.ts run <blogId> [options]
bun run src/cli.ts check <blogId>    # fast check without scraping editions
bun run src/cli.ts report [options]  # generate JSON report from DB

# Lint / format / check (Biome — not ESLint/Prettier)
bun run lint           # biome lint --write
bun run format         # biome format --write
bun run check          # biome check --write (lint + format together)

# Tests
bun test

# Cache
bun run cache:clear
```

## Architecture

**Runtime**: Bun (not Node.js). Uses `bun:sqlite`, `Bun.file`, `Bun.gzipSync/gunzipSync`, `Bun.write`.

**Data flow**: `BlogService` scrapes a Goodreads blog post → extracts book links → `BookService` fetches each book's detail page → `EditionService` fetches editions filtered by language/format/sort → `PipelineService` orchestrates it all → optional JSON report to `.reports/`.

### `src/services/`

- **`GoodreadsService`** — Facade. Exposes `.blog`, `.book`, `.edition` sub-services and aggregates telemetry.
- **`BaseScraperService`** — Abstract base all scrapers extend. Handles:
  - Session management (cookies stored in SQLite, TTL = `SESSION_TTL_MINUTES`)
  - `fetchContentWithFallback()`: tries HTTP first, falls back to Puppeteer if blocked/captcha detected
  - ETag/Last-Modified conditional GET (via `http_metadata` table)
  - Rate limiting (every request goes through `RateLimiter`)
- **`BlogService`**, **`BookService`**, **`EditionService`** — Domain-specific scrapers extending `BaseScraperService`. Each has a corresponding parser (`blog-parser.ts`, `book-parser.ts`, `editions-parser.ts`) using `linkedom` for HTML parsing.
- **`PipelineService`** — Stateless orchestrator; takes the three services + `DatabaseService`. Generates the combined report with deduplication by `title-author` canonical key.

### `src/core/`

- **`DatabaseService`** — SQLite facade (`library.sqlite` in project root). Acts as a compatibility shim over five typed repositories: `BookRepository`, `BlogRepository`, `EditionRepository`, `SessionRepository`, `MetadataRepository`.
- **`BrowserClient`** — Puppeteer singleton (one browser per run, multiple pages). Applies anti-detection (webdriver flag, UA spoofing) and blocks images/fonts/stylesheets for speed.
- **`HttpClient`** — `fetch`-based with browser-like headers, exponential backoff on 429/5xx, conditional GET support.
- **`CacheManager`** — File cache under `./cache/YYYY-MM-DD/[books|blog|authors|misc]/HASH.html.gz`. HTML is gzip-compressed; also holds a 5-min in-memory LRU (200 entries). Auto-purges directories older than `FILE_CACHE_LOOKBACK_DAYS`.
- **`RateLimiter`** — Enforces `SCRAPING_DELAY_BASE_MS` + random jitter between requests.

### `src/config/constants.ts`

All timing, TTL, retry, and URL constants live here. Change scraping behavior (delays, retries, cache TTL) here, not inline.

### Scripts (`scripts/`)

- `scripts/cli/pipeline.ts` — Main entry point, instantiates all services and runs the pipeline loop.
- `scripts/cli/report-books-relations.ts` — Standalone report generation from existing DB data.
- `scripts/debug/` — One-off debug scripts for individual parsers and fetchers.
- `scripts/db/` — DB query and export utilities.

## Key Conventions

- Parsers (`*-parser.ts`) are pure functions that accept HTML strings and return typed objects — no I/O.
- Services own their own `DatabaseService` and `CacheManager` instances (created inside `BaseScraperService`). The pipeline script creates a separate `DatabaseService` for report generation.
- Book IDs on Goodreads have two forms: the modern slug-based `id` (e.g. `"123.Title"`) and a numeric `legacyId`. Editions require `legacyId`; the `WORK_URL` path uses it.
- Canonical book deduplication in reports uses `title-author` lowercased and stripped of non-alphanumerics.
