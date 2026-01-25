/**
 * @file editions-parser.ts
 * @description Parser responsible for extracting filter and sort options from Goodreads editions page HTML.
 */

import { parseHTML } from "linkedom";
import type { Edition } from "../types";
import { getErrorMessage } from "../utils/util";

export interface FilterOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface EditionsFilters {
  sort: FilterOption[];
  format: FilterOption[];
  language: FilterOption[];
}

export interface PaginationInfo {
  hasNextPage: boolean;
  totalPages: number;
}

export function parseEditionsList(html: string): Edition[] {
  try {
    const { document } = parseHTML(html);
    const elements = document.querySelectorAll(".elementList");
    const editions: Edition[] = [];

    elements.forEach((el) => {
      // 1. Título y Link
      const titleEl = el.querySelector("a.bookTitle");
      const title = titleEl?.textContent?.trim() || "";
      const link = titleEl?.getAttribute("href") || "";

      if (!title) {
        return; // Skip if no title found
      }

      // 2. Cover Image
      const imgEl = el.querySelector(".leftAlignedImage img");
      const coverImage = imgEl?.getAttribute("src") || undefined;

      // 3. Info Básica (Formato, páginas, publicación)
      // Los dataRow no tienen clases específicas, dependemos del orden o contenido
      const dataRows = Array.from(el.querySelectorAll(".editionData > .dataRow"));

      let publishedDate: string | undefined;
      let publisher: string | undefined;
      let format: string | undefined;
      let pages: number | undefined;

      // Row 2: "Published November 2007 by Ediciones B"
      if (dataRows[1]) {
        const text = dataRows[1].textContent?.trim() || "";
        const publishedMatch = text.match(/Published\s+(.*?)\s+by\s+(.*)/i);
        if (publishedMatch) {
          publishedDate = publishedMatch[1].trim();
          publisher = publishedMatch[2].trim();
        } else {
          // Intento alternativo solo fecha
          const dateMatch = text.match(/Published\s+(.*)/i);
          if (dateMatch) {
            publishedDate = dateMatch[1].trim();
          }
        }
      }

      // Row 3: "Paperback, 690 pages"
      if (dataRows[2]) {
        const text = dataRows[2].textContent?.trim() || "";
        const parts = text.split(",").map((s) => s.trim());
        // Simple heurística: si tiene "pages", es el conteo de páginas
        parts.forEach((part) => {
          if (part.includes("pages")) {
            const num = parseInt(part.replace(/\D/g, ""), 10);
            if (!Number.isNaN(num)) {
              pages = num;
            }
          } else if (!/\d/.test(part)) {
            // Si no tiene números, asumimos que es el formato (ej. Paperback)
            // Ojo: "Mass Market Paperback" tiene 3 palabras
            format = part;
          }
        });
      }

      // 4. Detalles (ISBN, ASIN, Idioma, Rating)
      const detailsContainer = el.querySelector(".moreDetails");
      let isbn: string | undefined;
      let isbn10: string | undefined;
      let asin: string | undefined;
      let language: string | undefined;
      let averageRating: number | undefined;

      if (detailsContainer) {
        const detailRows = detailsContainer.querySelectorAll(".dataRow");
        detailRows.forEach((row) => {
          const titleText = row.querySelector(".dataTitle")?.textContent?.trim() || "";
          const valueEl = row.querySelector(".dataValue");
          const valueText = valueEl?.textContent?.trim() || "";

          if (titleText.includes("ISBN")) {
            // "9788466631990 (ISBN10: 8466631992)"
            const isbnMatch = valueText.match(/(\d{13})/);
            if (isbnMatch) {
              isbn = isbnMatch[1];
            }

            const isbn10Match = valueText.match(/ISBN10:\s*(\d{9,10}[Xx]?)/);
            if (isbn10Match) {
              isbn10 = isbn10Match[1];
            }
          } else if (titleText.includes("ASIN")) {
            asin = valueText;
          } else if (titleText.includes("Edition language")) {
            language = valueText;
          } else if (titleText.includes("Average rating")) {
            // "4.55 (25,860 ratings)"
            const ratingMatch = valueText.match(/(\d+(\.\d+)?)/);
            if (ratingMatch) {
              averageRating = parseFloat(ratingMatch[1]);
            }
          }
        });
      }

      editions.push({
        title,
        link,
        coverImage,
        format,
        pages,
        publishedDate,
        publisher,
        isbn,
        isbn10,
        asin,
        language,
        averageRating,
      });
    });

    return editions;
  } catch (error: unknown) {
    console.error("Error parsing editions list:", getErrorMessage(error));
    return [];
  }
}

export function parseEditionsHtml(html: string): EditionsFilters | null {
  try {
    const { document } = parseHTML(html);

    const extractOptions = (selectName: string): FilterOption[] => {
      const select = document.querySelector(`select[name="${selectName}"]`);
      if (!select) {
        return [];
      }

      return Array.from(select.querySelectorAll("option"))
        .map((opt) => {
          const value = opt.getAttribute("value")?.trim() || "";
          const label = opt.textContent?.trim() || "";
          const selected = opt.hasAttribute("selected");
          return { value, label, selected };
        })
        .filter((opt) => opt.value !== ""); // Filter out empty value options (placeholders)
    };

    return {
      sort: extractOptions("sort"),
      format: extractOptions("filter_by_format"),
      language: extractOptions("filter_by_language"),
    };
  } catch (error: unknown) {
    console.error("Error parsing editions HTML:", getErrorMessage(error));
    return null;
  }
}

export function extractPaginationInfo(html: string): PaginationInfo {
  try {
    const { document } = parseHTML(html);

    // 1. Intentar determinar el total mediante el texto "Showing 1-30 of 123"
    // Este texto suele estar en div.infoText o .showingPages
    const infoText = document.querySelector(".infoText, .showingPages")?.textContent?.trim();
    let totalFromInfo = 0;

    if (infoText) {
      // Regex para capturar: Showing 1-30 of 123
      const match = infoText.match(/(\d+)-(\d+)\s+of\s+([\d,]+)/i);
      if (match?.[2] && match[3]) {
        const endItem = parseInt(match[2].replace(/,/g, ""), 10);
        const startItem = parseInt(match[1].replace(/,/g, ""), 10);
        const totalItems = parseInt(match[3].replace(/,/g, ""), 10);

        const itemsPerPage = endItem - startItem + 1;

        if (itemsPerPage > 0) {
          totalFromInfo = Math.ceil(totalItems / itemsPerPage);
        }
      }
    }

    // 2. Localizar el contenedor de paginación para buscar el número de página más alto visible
    let container = document.querySelector(".pagination");
    if (!container) {
      const nextPage = document.querySelector("a.next_page");
      if (nextPage) {
        container = nextPage.parentElement;
      } else {
        const current = document.querySelector("em.current");
        if (current) {
          container = current.parentElement;
        }
      }
    }

    let maxPageFromLinks = 1;
    if (container) {
      const allLinks = container.querySelectorAll("a, em.current");
      allLinks.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && /^\d+$/.test(text)) {
          const pageNum = parseInt(text, 10);
          if (pageNum > maxPageFromLinks) {
            maxPageFromLinks = pageNum;
          }
        }
      });
    }

    // Usamos el mayor de los dos métodos
    const totalPages = Math.max(maxPageFromLinks, totalFromInfo);
    const hasNextPage = !!document.querySelector("a.next_page");

    return {
      hasNextPage,
      totalPages,
    };
  } catch (error: unknown) {
    console.error("Error extracting pagination info:", getErrorMessage(error));
    return { hasNextPage: false, totalPages: 1 };
  }
}
