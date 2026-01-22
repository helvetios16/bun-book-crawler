/**
 * @file blog-parser.ts
 * @description Parser responsible for extracting structured data from Goodreads blog HTML.
 */

import { parseHTML } from "linkedom";
import type { Blog, Book } from "../types";

export function parseBlogHtml(html: string, url?: string): Blog | null {
  try {
    const { document } = parseHTML(html);

    // Extract metadata from Open Graph tags
    const rawTitle =
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const title = rawTitle.trim() || undefined;
    const description =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      undefined;
    const imageUrl =
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") || undefined;
    const webUrl =
      url ||
      document.querySelector('meta[property="og:url"]')?.getAttribute("content") ||
      undefined;

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
    const booksWithContext: (Book & { section?: string })[] = [];
    let currentSection = "Intro";

    // Recursive function to traverse DOM and capture context
    function traverse(node: Node) {
      if (!node) {
        return;
      }

      // Only process Elements
      if (node.nodeType === 1) {
        const element = node as Element;

        // 1. Detect Headers (Context)
        if (/^H[1-6]$/.test(element.tagName)) {
          const headerText = element.textContent?.trim();
          if (headerText) {
            currentSection = headerText;
          }
        }

        // 2. Detect Book Links
        if (element.tagName === "A" && element.getAttribute("href")?.includes("/book/show/")) {
          const href = element.getAttribute("href");

          if (href) {
            const match = href.match(/\/book\/show\/([^?#]+)/);

            if (match?.[1]) {
              const fullId = match[1];
              const numericId = fullId.split("-")[0];

              const img = element.querySelector("img");
              const text = element.textContent?.trim();
              const imgAlt = img?.getAttribute("alt");

              const candidate: Book & { section?: string } = {
                id: fullId,
                title: "",
                webUrl: href.startsWith("http") ? href : `https://www.goodreads.com${href}`,
                section: currentSection,
              };

              if (img) {
                candidate.coverImage = img.getAttribute("src") || undefined;
                if (imgAlt) {
                  candidate.title = imgAlt;
                }
              } else if (text && text.length > 1 && !["Read more", "View details"].includes(text)) {
                candidate.title = text.replace(/\s+/g, " ");
              }

              const lastBook = booksWithContext[booksWithContext.length - 1];
              const lastId = lastBook?.id.split("-")[0];

              if (lastBook && lastId === numericId && lastBook.section === currentSection) {
                if (!lastBook.title && candidate.title) {
                  lastBook.title = candidate.title;
                }
                if (!lastBook.coverImage && candidate.coverImage) {
                  lastBook.coverImage = candidate.coverImage;
                }
              } else {
                booksWithContext.push(candidate);
              }
            }
          }
        }
      }

      if (node.childNodes && node.childNodes.length > 0) {
        for (const child of node.childNodes) {
          traverse(child);
        }
      }
    }

    traverse(contentContainer);

    // Filter valid books:
    // 1. Must have Title or Image
    // 2. Section (trimmed) must not be equal to the Blog Title (trimmed)
    const books = booksWithContext.filter((b) => {
      const hasContent = b.title || b.coverImage;
      const cleanSection = b.section?.trim().toLowerCase();
      const cleanTitle = title?.trim().toLowerCase();

      const isMainHeader = cleanTitle && cleanSection === cleanTitle;
      return hasContent && !isMainHeader;
    });

    return {
      title,
      description,
      imageUrl,
      webUrl,
      // content,
      mentionedBooks: books,
    };
  } catch (error) {
    console.error("Error parsing blog HTML:", error);
    return null;
  }
}
