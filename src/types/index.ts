// src/types/index.ts

/**
 * Represents the result of a scrape operation.
 * Can be extended to include more structured data, e.g., a Book interface.
 */
export interface ScrapeResult {
  title: string;
  contentLength: number;
  // Future extension:
  // books: Book[];
}

/**
 * Represents a book with its title and author.
 * Example for future, more detailed scraping.
 */
export interface Book {
  title: string;
  author: string;
  language: string;
}
