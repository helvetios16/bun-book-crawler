/**
 * @file index.ts
 * @description Main entry point for the Goodreads scraping application.
 */

import type { Page } from "puppeteer";
import { BrowserClient } from "./src/core/browser-client";
import { GoodreadsService } from "./src/services/goodreads-service";
import { isValidBookId } from "./src/utils/util";

async function main(): Promise<void> {
  const browserClient = new BrowserClient();
  let page: Page;

  try {
    const bookId = "123224254-mistborn"; // 41886271-the-sword-of-kaigen

    if (!isValidBookId(bookId)) {
      console.error(`❌ El ID del libro no es válido: ${bookId}`);
      return;
    }

    page = await browserClient.launch();

    const goodreadsService = new GoodreadsService(page);

    const book = await goodreadsService.lookBook(bookId);

    if (book) {
      console.log("📚 Libro encontrado:");
      console.log(book);
    } else {
      console.log("! No se pudo extraer la información del libro.");
    }
  } catch (error) {
    console.error("❌ Ocurrió un error durante el proceso de scraping:", error);
  } finally {
    await browserClient.close();
    console.log("✨ Proceso completado.");
  }
}

main().catch(console.error);
