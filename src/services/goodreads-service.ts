/**
 * @file goodreads-service.ts
 * @description Service responsible for navigating Goodreads and storing book information.
 */

import type { Page } from "puppeteer";
import { BLOG_URL, BOOK_URL, GOODREADS_URL } from "../config/constants";
import { CacheManager } from "../core/cache-manager";
import type { Book } from "../types";
import { isValidBookId } from "../utils/util";
import { parseBlogHtml } from "./blog-parser";
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
    console.log(`🔎 Buscando libro ${id}...`);

    // 1. Intentar cargar desde caché
    try {
      const cachedData = await this.cache.get(url, ".json");
      if (cachedData) {
        console.log("📦 Cache hit (JSON).");
        const book = parseBookData(JSON.parse(cachedData));
        if (book) {
          return book;
        }
        console.warn("! Datos en caché encontrados pero inválidos o incompletos.");
      }
    } catch (error) {
      console.warn("! Error al leer/parsear caché, continuando con red:", error);
    }

    // 2. Navegación Web
    console.log(`🌐 Navegando a Goodreads: ${url}`);

    const response = await this.page.goto(url, { waitUntil: "domcontentloaded" });

    if (!response) {
      throw new Error("❌ No se recibió respuesta del navegador.");
    }

    const status = response.status();

    // Manejo de códigos de estado HTTP
    if (status === 404) {
      console.error("❌ Libro no encontrado (404).");
      return null;
    }

    if (status === 403 || status === 429) {
      throw new Error(`⛔ Acceso denegado o límite de peticiones excedido (Status: ${status}).`);
    }

    // Verificación de redirecciones no deseadas (Login / Captcha)
    const currentUrl = this.page.url();
    if (currentUrl.includes("/user/sign_in") || currentUrl.includes("captcha")) {
      throw new Error("⛔ Redirigido a página de Login o Captcha. Se requiere intervención.");
    }

    if (!response.ok()) {
      console.warn(`! Respuesta HTTP no exitosa: ${status}`);
    }

    await this.page.waitForSelector("body");
    console.log("✅ Página cargada correctamente.");

    let bookData: Book | null = null;

    // 3. Extracción de Datos (Next.js Data)
    const nextDataElement = await this.page.$("#__NEXT_DATA__");

    if (nextDataElement) {
      const nextData = await this.page.evaluate((el) => el.textContent, nextDataElement);

      if (nextData) {
        try {
          const parsedJson = JSON.parse(nextData);
          const formattedJson = JSON.stringify(parsedJson, null, 2);

          // Guardar JSON en caché
          await this.cache.save({
            url,
            content: formattedJson,
            force: false,
            extension: ".json",
          });

          // Parsear datos del libro
          bookData = parseBookData(parsedJson);
        } catch (e) {
          console.warn("! Fallo al procesar datos de Next.js:", e);
        }
      }
    } else {
      console.warn("! No se encontró la etiqueta #__NEXT_DATA__ en la página.");
    }

    // 4. Guardar HTML como respaldo
    const content = await this.page.content();
    await this.cache.save({ url, content, force: false, extension: ".html" });

    return bookData;
  }

  public async lookBlog(id: string): Promise<void> {
    const url = `${GOODREADS_URL}${BLOG_URL}${id}`;
    console.log(`🔎 Buscando blog ${id}...`);

    // 1. Intentar cargar desde caché (HTML y procesar) o JSON parseado
    try {
      // Verificar si ya tenemos el JSON procesado
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        console.log("📦 Cache hit (Parsed JSON).");
        return;
      }
    } catch (_error) {
      // Ignorar error de caché
    }

    // 2. Navegación Web
    console.log(`🌐 Navegando a Goodreads (Blog): ${url}`);

    const response = await this.page.goto(url, { waitUntil: "domcontentloaded" });

    if (!response) {
      throw new Error("❌ No se recibió respuesta del navegador.");
    }

    const status = response.status();

    if (status === 404) {
      console.error("❌ Blog no encontrado (404).");
      return;
    }

    if (status === 403 || status === 429) {
      throw new Error(`⛔ Acceso denegado o límite de peticiones excedido (Status: ${status}).`);
    }

    const currentUrl = this.page.url();
    if (currentUrl.includes("/user/sign_in") || currentUrl.includes("captcha")) {
      throw new Error("⛔ Redirigido a página de Login o Captcha. Se requiere intervención.");
    }

    await this.page.waitForSelector("body");
    console.log("✅ Página cargada correctamente.");

    // 3. Obtener HTML y Guardar
    const content = await this.page.content();
    await this.cache.save({ url, content, force: false, extension: ".html" });

    // 4. Parsear y Guardar JSON estructurado
    console.log("⚙️ Parseando contenido del blog...");
    const blogData = parseBlogHtml(content, url);

    if (blogData) {
      const jsonContent = JSON.stringify(blogData, null, 2);
      await this.cache.save({
        url,
        content: jsonContent,
        force: true,
        extension: "-parsed.json",
      });
      console.log(
        `✅ Blog parseado y guardado (${blogData.mentionedBooks?.length || 0} libros encontrados).`,
      );
    } else {
      console.warn("! No se pudo parsear el contenido del blog.");
    }
  }
}
