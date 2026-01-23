/**
 * @file editions-parser.ts
 * @description Parser responsible for extracting filter and sort options from Goodreads editions page HTML.
 */

import { parseHTML } from "linkedom";

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
  } catch (error) {
    console.error("Error parsing editions HTML:", error);
    return null;
  }
}

export function extractPaginationInfo(html: string): PaginationInfo {
  try {
    const { document } = parseHTML(html);

    // Intentamos localizar el contenedor de paginación mediante elementos conocidos
    // GoodReads a veces usa div.pagination y otras veces divs genéricos
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

    if (!container) {
      return { hasNextPage: false, totalPages: 1 };
    }

    const nextLink = container.querySelector("a.next_page");
    // Buscamos tanto enlaces (a) como el elemento actual (em) que contengan números
    const allLinks = container.querySelectorAll("a, em.current");

    let maxPage = 1;

    allLinks.forEach((el) => {
      const text = el.textContent?.trim();
      if (text && /^\d+$/.test(text)) {
        const pageNum = parseInt(text, 10);
        if (pageNum > maxPage) {
          maxPage = pageNum;
        }
      }
    });

    return {
      hasNextPage: !!nextLink,
      totalPages: maxPage,
    };
  } catch (error) {
    console.error("Error extracting pagination info:", error);
    return { hasNextPage: false, totalPages: 1 };
  }
}
