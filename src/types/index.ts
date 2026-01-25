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
  title: string;
  legacyId?: number;
  titleComplete?: string;
  description?: string;
  author?: string;
  webUrl?: string;
  averageRating?: number;
  pageCount?: number;
  language?: string;
  format?: string;
  coverImage?: string;
}

export interface Blog {
  id: string;
  title: string;
  webUrl?: string;
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

export interface Edition {
  title: string;
  link: string;
  coverImage?: string;
  format?: string;
  pages?: number;
  publishedDate?: string;
  publisher?: string;
  isbn?: string; // ISBN 13
  isbn10?: string;
  asin?: string;
  language?: string;
  averageRating?: number;
}
