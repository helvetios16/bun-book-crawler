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
