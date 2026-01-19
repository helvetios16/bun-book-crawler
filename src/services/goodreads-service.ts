/**
 * @file goodreads-service.ts
 * @description Service responsible for navigating Goodreads and storing book information.
 */

import type { Page } from "puppeteer";
import { BOOK_URL, GOODREADS_URL } from "../config/constants";
import { CacheManager } from "../core/cache-manager";
import type { Book } from "../types";
import { isValidBookId } from "../utils/util";
import { parseBookData } from "./goodreads-parser";

export class GoodreadsService {
  private readonly page: Page;
  private readonly cache = new CacheManager();

  constructor(page: Page) {
    this.page = page;
  }

  public async lookBook(id: string): Promise<Book | null> {
    if (!isValidBookId(id)) {
      throw new Error(`Invalid Book ID format: ${id}`);
    }

    const url = `${GOODREADS_URL}${BOOK_URL}${id}`;
    console.log(` Buscando libro ${id}...`);

    console.log(` Navegando a Goodreads: ${url}`);
    await this.page.goto(url, { waitUntil: "domcontentloaded" });

    await this.page.waitForSelector("body");
    console.log("✅ Página cargada.");

    let bookData: Book | null = null;

    const nextData = await this.page.$eval("#__NEXT_DATA__", (el) => el.textContent);
    if (nextData) {
      const parsedJson = JSON.parse(nextData);
      const formattedJson = JSON.stringify(parsedJson, null, 2);

      // Cache the raw JSON
      await this.cache.save({
        url,
        content: formattedJson,
        force: false,
        extension: ".json",
      });

      // Parse the book data
      bookData = parseBookData(parsedJson);
    }

    const content = await this.page.content();
    await this.cache.save({ url, content, force: false, extension: ".html" });

    return bookData;
  }
}
