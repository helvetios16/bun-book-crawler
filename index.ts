/**
 * @file index.ts
 * @description Main entry point for the Goodreads scraping application.
 */

import { BrowserClient } from "./src/core/browser-client";
import { GoodreadsService } from "./src/services/goodreads-service";
import { getErrorMessage } from "./src/utils/util";

async function main(): Promise<void> {
  const browserClient = new BrowserClient();
  try {
    const bookId = "123224254-mistborn";
    // const blogId = "3038-winners-wild-cards-from-past-goodreads-choice-awards";

    const page = await browserClient.launch();
    const goodreadsService = new GoodreadsService(page);

    // --- MODO LIBRO ---
    const book = await goodreadsService.scrapeBook(bookId);
    if (book) {
      console.log("📚 Libro encontrado:");
      console.log(`Legacy Id: ${book.legacyId}`);
      await goodreadsService.scrapeEditionsFilters(book.legacyId as number);

      // Prueba de filtro: Spanish y ebook (más probable que tenga muchas páginas)
      console.log("🔍 Aplicando filtros de prueba (Carga de múltiples páginas)...");
      await goodreadsService.scrapeFilteredEditions(book.legacyId as number, {
        language: "spa",
        format: "Kindle Edition",
      });
    } else {
      console.log("! No se pudo extraer la información del libro.");
    }

    // --- MODO BLOG (Descomenta para usar) ---
    // console.log("\n--- Buscando Blog ---");
    // Usamos el ID del blog detectado en caché o uno de prueba
    // const targetBlogId = "3038-winners-wild-cards-from-past-goodreads-choice-awards";
    // await goodreadsService.scrapeBlog(targetBlogId);
    // console.log("✅ Proceso de blog finalizado.");
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("❌ Ocurrió un error durante el proceso de scraping:", message);
  } finally {
    await browserClient.close();
    console.log("✨ Proceso completado.");
  }
}

main().catch(console.error);
