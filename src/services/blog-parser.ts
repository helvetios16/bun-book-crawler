/**
 * @file blog-parser.ts
 * @description Parser responsible for extracting structured data from Goodreads blog HTML.
 */

import { parseHTML } from "linkedom";
import type { Blog, Book } from "../types";
import { Logger } from "../utils/logger";

const log = new Logger("BlogParser");

type BookWithSection = Book & { section?: string };

/**
 * Extracts a book ID from a Goodreads book href.
 * @returns The full ID (e.g., "12345-title-slug") or null if not a valid book link.
 */
function extractBookIdFromHref(href: string | null | undefined): string | null {
  if (!href?.includes("/book/show/")) {
    return null;
  }
  const match = href.match(/\/book\/show\/([^?#]+)/);
  return match?.[1] ?? null;
}

/**
 * Builds a full Goodreads URL from a potentially relative href.
 */
function toFullUrl(href: string): string {
  return href.startsWith("http") ? href : `https://www.goodreads.com${href}`;
}

/**
 * Merges a new candidate's data into the last book if they share the same numeric ID.
 * @returns true if merged, false if no merge occurred.
 */
function tryMergeWithLast(
  books: BookWithSection[],
  numericId: string,
  update: Partial<BookWithSection>,
  sectionCheck?: string,
): boolean {
  const lastBook = books[books.length - 1];
  if (!lastBook) {
    return false;
  }
  const lastNumericId = lastBook.id.split("-")[0];
  if (lastNumericId !== numericId) {
    return false;
  }
  if (sectionCheck !== undefined && lastBook.section !== sectionCheck) {
    return false;
  }

  if (update.title && !lastBook.title) {
    lastBook.title = update.title;
  } else if (update.title && lastBook.title !== update.title) {
    lastBook.title = update.title;
  }
  if (update.coverImage && !lastBook.coverImage) {
    lastBook.coverImage = update.coverImage;
  }
  if (update.author) {
    lastBook.author = update.author;
  }
  return true;
}

export function parseBlogHtml(html: string, url?: string): Blog | null {
  try {
    const { document } = parseHTML(html);

    // Extract metadata from Open Graph tags
    const rawTitle =
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const title = rawTitle.trim() || "Untitled Blog";
    const description =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      undefined;
    const imageUrl =
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") || undefined;
    const webUrl =
      url ||
      document.querySelector('meta[property="og:url"]')?.getAttribute("content") ||
      undefined;

    const blogId = webUrl?.match(/\/blog\/show\/(\d+)/)?.[1] || "unknown";

    // Main content container (or body fallback)
    const contentContainer = document.querySelector(".newsShowColumn") || document.body;
    let _content: string | undefined;

    if (contentContainer) {
      const clone = contentContainer.cloneNode(true) as HTMLElement;

      const scripts = clone.querySelectorAll("script");
      scripts.forEach((s) => {
        s.remove();
      });
      const styles = clone.querySelectorAll("style");
      styles.forEach((s) => {
        s.remove();
      });

      _content = clone.innerHTML.trim();
    }

    // --- Contextual Book Extraction Logic ---
    // Two-pass strategy: first try the precise tooltip-container format (modern blogs).
    // Only fall back to loose link scanning if no tooltip books were found (older blog formats).
    const booksWithContext: BookWithSection[] = [];
    let currentSection = "Intro";

    function traversePrecise(node: Node) {
      if (!node) {
        return;
      }

      if (node.nodeType === 1) {
        const element = node as Element;

        // 1. Detect Headers (Context)
        if (/^H[1-6]$/.test(element.tagName)) {
          const headerText = element.textContent?.trim();
          if (headerText) {
            currentSection = headerText;
          }
        }

        // 2. Precise Match: Goodreads Tooltip/Book Container (Image & ID)
        if (
          element.tagName === "DIV" &&
          element.classList.contains("js-tooltipTrigger") &&
          element.classList.contains("book")
        ) {
          const anchor = element.querySelector("a");
          const img = element.querySelector("img");
          const href = anchor?.getAttribute("href");
          const fullId = extractBookIdFromHref(href);

          if (fullId && href) {
            booksWithContext.push({
              id: fullId,
              title: img?.getAttribute("alt")?.trim() || anchor?.textContent?.trim() || "",
              webUrl: toFullUrl(href),
              section: currentSection,
              coverImage: img?.getAttribute("src") || undefined,
            });
            return;
          }
        }

        // 3. Precise Match: Book Info Row (Title & Author text)
        if (element.tagName === "DIV" && element.classList.contains("bookInfoFullRow")) {
          const titleAnchor = element.querySelector(".bookTitle a[href*='/book/show/']");
          if (titleAnchor) {
            const href = titleAnchor.getAttribute("href");
            const fullTitle = titleAnchor.textContent?.trim();
            const fullId = extractBookIdFromHref(href);

            if (fullId && fullTitle) {
              const numericId = fullId.split("-")[0];
              const authorAnchor = element.querySelector(".bookTitle a[href*='/author/show/']");
              const author = authorAnchor?.textContent?.trim();

              if (tryMergeWithLast(booksWithContext, numericId, { title: fullTitle, author })) {
                return;
              }
            }
          }
        }
      }

      if (node.childNodes && node.childNodes.length > 0) {
        for (const child of node.childNodes) {
          traversePrecise(child);
        }
      }
    }

    function traverseFallback(node: Node) {
      if (!node) {
        return;
      }

      if (node.nodeType === 1) {
        const element = node as Element;

        if (/^H[1-6]$/.test(element.tagName)) {
          const headerText = element.textContent?.trim();
          if (headerText) {
            currentSection = headerText;
          }
        }

        // Fallback: Detect loose Book Links (for older blog formats)
        if (element.tagName === "A") {
          const href = element.getAttribute("href");
          const fullId = extractBookIdFromHref(href);

          if (fullId && href) {
            const numericId = fullId.split("-")[0];
            const img = element.querySelector("img");
            const text = element.textContent?.trim();
            const imgAlt = img?.getAttribute("alt");

            let title = "";
            let coverImage: string | undefined;

            if (img) {
              coverImage = img.getAttribute("src") || undefined;
              if (imgAlt) {
                title = imgAlt;
              }
            } else if (text && text.length > 1 && !["Read more", "View details"].includes(text)) {
              title = text.replace(/\s+/g, " ");
            }

            if (
              !tryMergeWithLast(booksWithContext, numericId, { title, coverImage }, currentSection)
            ) {
              booksWithContext.push({
                id: fullId,
                title,
                webUrl: toFullUrl(href),
                section: currentSection,
                coverImage,
              });
            }
          }
        }
      }

      if (node.childNodes && node.childNodes.length > 0) {
        for (const child of node.childNodes) {
          traverseFallback(child);
        }
      }
    }

    traversePrecise(contentContainer);
    if (booksWithContext.length === 0) {
      traverseFallback(contentContainer);
    }

    // Filter valid books:
    // 1. Must have Title or Image
    // 2. Ensure Uniqueness by ID
    const uniqueIds = new Set<string>();
    const books: BookWithSection[] = [];

    for (const b of booksWithContext) {
      const hasContent = b.title || b.coverImage;
      const numericId = b.id.split("-")[0] ?? ""; // Normalize ID for uniqueness check

      if (hasContent && numericId && !uniqueIds.has(numericId)) {
        uniqueIds.add(numericId);
        books.push(b);
      }
    }

    return {
      id: blogId,
      title,
      description,
      imageUrl,
      webUrl,
      // content,
      mentionedBooks: books,
    };
  } catch (error: unknown) {
    log.error("Error parsing blog HTML:", error);
    return null;
  }
}
