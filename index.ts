/**
 * @file index.ts
 * @description Main entry point for the Goodreads scraping application.
 */

import { BrowserClient } from "./src/core/browser-client";
import { GoodreadsService } from "./src/services/goodreads-service";

async function main(): Promise<void> {
  const browserClient = new BrowserClient();
  try {
    const bookId = "123224254-mistborn";
    // const blogId = "3038-winners-wild-cards-from-past-goodreads-choice-awards";

    const page = await browserClient.launch();
    const goodreadsService = new GoodreadsService(page);

    // --- MODO LIBRO ---
    const book = await goodreadsService.lookBook(bookId);
    if (book) {
      console.log("📚 Libro encontrado:");
      console.log(`Legacy Id: ${book.legacyId}`);
      await goodreadsService.lookBookEditions(book.legacyId as number);

      // Prueba de filtro: Inglés y Paperback (más probable que tenga muchas páginas)
      console.log("🔍 Aplicando filtros de prueba (Carga de múltiples páginas)...");
      await goodreadsService.lookBookFilter(book.legacyId as number, {});
    } else {
      console.log("! No se pudo extraer la información del libro.");
    }

    // --- MODO BLOG (Descomenta para usar) ---
    // console.log("\n--- Buscando Blog ---");
    // Usamos el ID del blog detectado en caché o uno de prueba
    // const targetBlogId = "3038-winners-wild-cards-from-past-goodreads-choice-awards";
    // await goodreadsService.lookBlog(targetBlogId);
    // console.log("✅ Proceso de blog finalizado.");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Ocurrió un error durante el proceso de scraping:", errorMessage);
  } finally {
    await browserClient.close();
    console.log("✨ Proceso completado.");
  }
}

main().catch(console.error);
