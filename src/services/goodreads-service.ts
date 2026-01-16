/**
 * @file goodreads-service.ts
 * @description Service responsible for navigating Goodreads and storing book information.
 */

import type { Page } from "puppeteer";
import { GOODREADS_URL } from "../config/constants";
import { CacheManager } from "../core/cache-manager";
import { isValidBookId } from "../utils/util";

export class GoodreadsService {
  private readonly page: Page;
  private readonly cache = new CacheManager();

  constructor(page: Page) {
    this.page = page;
  }

  public async lookBook(id: string): Promise<void> {
    if (!isValidBookId(id)) {
      throw new Error(`Invalid Book ID format: ${id}`);
    }

    const url = `${GOODREADS_URL}/book/show/${id}`;
    console.log(` Buscando libro ${id}...`);

    console.log(` Navegando a Goodreads: ${url}`);
    await this.page.goto(url, { waitUntil: "domcontentloaded" });

    await this.page.waitForSelector("body");
    console.log("✅ Página cargada.");

    const nextData = await this.page.$eval("#__NEXT_DATA__", (el) => el.textContent);
    if (nextData) {
      const formattedJson = JSON.stringify(JSON.parse(nextData), null, 2);
      await this.cache.save(url, formattedJson, false, ".json");
    }

    const content = await this.page.content();
    await this.cache.save(url, content, false, ".html");
  }
}
