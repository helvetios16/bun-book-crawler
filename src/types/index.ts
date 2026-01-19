// src/types/index.ts

/**
 * Represents the result of a scrape operation.
 */
export interface ScrapeResult {
  title: string;
  contentLength: number;
}

/**
 * Represents a book with detailed information extracted from Goodreads.
 */
export interface Book {
  id: string;
  legacyId?: string;
  title: string;
  titleComplete?: string;
  author?: string;
  description?: string;
  pages?: number;
  language?: string;
  format?: string;
  coverImage?: string;
}
