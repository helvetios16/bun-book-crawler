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
  legacyId?: number;
  title: string;
  titleComplete?: string;
  description?: string;
  author?: string;
  webUrl?: string;
  genres?: string[];
  series?: string[];
  averageRating?: number;
  ratingCount?: number;
  publicationDate?: string;
  publisher?: string;
  pageCount?: number;
  language?: string;
  format?: string;
  coverImage?: string;
}

export interface Blog {
  id?: string;
  webUrl?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  content?: string;
  author?: string;
  createdAt?: string;
  tags?: string[];
  mentionedBooks?: (Book & { section?: string })[];
}

/**
 * Options for filtering book editions.
 */
export interface BookFilterOptions {
  sort?: string;
  format?: string;
  language?: string;
}
