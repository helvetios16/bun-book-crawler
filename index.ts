/**
 * @file index.ts
 * @description Main entry point for the Goodreads scraping application.
 */

import { BrowserClient } from "./src/core/browser-client";
import { GoodreadsService } from "./src/services/goodreads-service";

async function main(): Promise<void> {
  const browserClient = new BrowserClient();
  try {
    // const bookId = "123224254-mistborn";
    const _blogId = "3038-winners-wild-cards-from-past-goodreads-choice-awards";

    const page = await browserClient.launch();
    const goodreadsService = new GoodreadsService(page);

    // --- MODO LIBRO ---
    // if (isValidBookId(bookId)) {
    //   const book = await goodreadsService.lookBook(bookId);
    //   if (book) {
    //     console.log("📚 Libro encontrado:");
    //     console.log(book);
    //   } else {
    //     console.log("! No se pudo extraer la información del libro.");
    //   }
    // }

    // --- MODO BLOG (Descomenta para usar) ---
    console.log("\n--- Buscando Blog ---");
    // Usamos el ID del blog detectado en caché o uno de prueba
    const targetBlogId = "3038-winners-wild-cards-from-past-goodreads-choice-awards";
    await goodreadsService.lookBlog(targetBlogId);
    console.log("✅ Proceso de blog finalizado.");
  } catch (error) {
    console.error("❌ Ocurrió un error durante el proceso de scraping:", error);
  } finally {
    await browserClient.close();
    console.log("✨ Proceso completado.");
  }
}

main().catch(console.error);
