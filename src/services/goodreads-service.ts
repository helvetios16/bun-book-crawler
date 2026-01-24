/**
 * @file goodreads-service.ts
 * @description Service responsible for navigating Goodreads and storing book information.
 */

import type { Page } from "puppeteer";
import { BLOG_URL, BOOK_URL, GOODREADS_URL, WORK_URL } from "../config/constants";
import { CacheManager } from "../core/cache-manager";
import type { Book, BookFilterOptions, Edition } from "../types";
import { delay, getErrorMessage, isValidBookId } from "../utils/util";
import { parseBlogHtml } from "./blog-parser";
import { parseBookData } from "./book-parser";
import {
  type EditionsFilters,
  extractPaginationInfo,
  parseEditionsHtml,
  parseEditionsList,
} from "./editions-parser";

export class GoodreadsService {
  private readonly page: Page;
  private readonly cache = new CacheManager();

  constructor(page: Page) {
    this.page = page;
  }

  public async scrapeBook(id: string): Promise<Book | null> {
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
    } catch (error: unknown) {
      console.warn("! Error al leer/parsear caché, continuando con red:", getErrorMessage(error));
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
        } catch (e: unknown) {
          console.warn("! Fallo al procesar datos de Next.js:", getErrorMessage(e));
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

  public async scrapeEditionsFilters(legacyId: string | number): Promise<void> {
    const url = `${GOODREADS_URL}${WORK_URL}${legacyId}`;
    console.log(`🔎 Buscando ediciones del libro (Work ID: ${legacyId})...`);

    // 1. Intentar cargar desde caché (Parsed JSON)
    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        console.log("📦 Cache hit (Parsed JSON).");
        return;
      }
    } catch (error: unknown) {
      // Ignorar error de caché pero loguear para debug
      console.warn("ℹ️ Cache miss o error al leer caché de ediciones:", getErrorMessage(error));
    }

    // 2. Navegación Web
    console.log(`🌐 Navegando a Goodreads: ${url}`);

    const response = await this.page.goto(url, { waitUntil: "domcontentloaded" });

    if (!response) {
      throw new Error("❌ No se recibió respuesta del navegador.");
    }

    const status = response.status();

    if (status === 404) {
      console.error("❌ Libro no encontrado (404).");
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

    // 4. Parsear y Guardar JSON
    console.log("⚙  Parseando filtros de ediciones...");
    const editionsData = parseEditionsHtml(content);

    if (editionsData) {
      const jsonContent = JSON.stringify(editionsData, null, 2);
      await this.cache.save({
        url,
        content: jsonContent,
        force: true,
        extension: "-parsed.json",
      });
      console.log(
        `✅ Datos de ediciones parseados y guardados (${editionsData.language.length} idiomas encontrados).`,
      );
    } else {
      console.warn("! No se pudo parsear la información de ediciones.");
    }
  }

  public async scrapeBlog(id: string): Promise<void> {
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
    } catch (error: unknown) {
      // Ignorar error de caché pero loguear
      console.warn("ℹ️ Cache miss o error al leer caché de blog:", getErrorMessage(error));
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
    console.log("⚙  Parseando contenido del blog...");
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

  public async scrapeFilteredEditions(
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<void> {
    const baseUrl = `${GOODREADS_URL}${WORK_URL}${legacyId}`;
    console.log(`🔎 Verificando filtros para Work ID: ${legacyId}...`);

    // 1. Cargar metadatos de validación
    const cachedMetadata = await this.cache.get(baseUrl, "-parsed.json");
    if (!cachedMetadata) {
      throw new Error(
        `❌ No se encontraron metadatos de ediciones para ID ${legacyId}. Ejecute 'lookBookEditions' primero.`,
      );
    }

    const validOptions = JSON.parse(cachedMetadata) as EditionsFilters;

    // 2. Validar Parámetros
    const sort = options.sort || "num_ratings";
    const format = options.format || "";
    const language = options.language || "";

    if (!validOptions.sort.some((s) => s.value === sort)) {
      throw new Error(`❌ Opción de ordenamiento inválida: '${sort}'.`);
    }

    if (format && !validOptions.format.some((f) => f.value === format)) {
      throw new Error(`❌ Formato inválido: '${format}'.`);
    }

    if (language && !validOptions.language.some((l) => l.value === language)) {
      throw new Error(`❌ Idioma inválido: '${language}'.`);
    }

    // 3. Construir URL Base
    const query = new URLSearchParams();
    query.append("utf8", "✓");
    query.append("sort", sort);
    if (format) {
      query.append("filter_by_format", format);
    }
    if (language) {
      query.append("filter_by_language", language);
    }

    const baseUrlWithParams = `${baseUrl}?${query.toString()}`;
    console.log(`✅ Filtros validados. Iniciando escaneo en: ${baseUrlWithParams}`);

    const scrapedPages: string[] = [];
    const allEditions: Edition[] = [];

    // --- Procesar Página 1 ---
    const page1Url = baseUrlWithParams;
    let page1Content = await this.cache.get(page1Url, ".html");

    if (!page1Content) {
      console.log(`🌐 Navegando a página 1...`);
      const response = await this.page.goto(page1Url, { waitUntil: "domcontentloaded" });

      if (!response) {
        throw new Error("No response");
      }

      if (response.status() === 404) {
        console.error("❌ Página no encontrada (404).");
        return;
      }

      await this.page.waitForSelector("body");
      page1Content = await this.page.content();
      await this.cache.save({
        url: page1Url,
        content: page1Content,
        force: true,
        extension: ".html",
      });
    } else {
      console.log(`📦 Cache hit página 1.`);
    }
    scrapedPages.push(page1Url);

    // Parsear ediciones página 1
    const page1Editions = parseEditionsList(page1Content);
    allEditions.push(...page1Editions);
    console.log(`📄 Página 1: ${page1Editions.length} ediciones encontradas.`);

    // --- Detectar Paginación ---
    const pagination = extractPaginationInfo(page1Content);
    console.log(`📊 Paginación detectada: ${pagination.totalPages} páginas totales.`);

    // --- Procesar Páginas Restantes ---
    if (pagination.totalPages > 1) {
      for (let i = 2; i <= pagination.totalPages; i++) {
        const pageUrl = `${baseUrlWithParams}&page=${i}`;
        let content = await this.cache.get(pageUrl, ".html");

        if (!content) {
          console.log(`🌐 Navegando a página ${i}/${pagination.totalPages}...`);
          await delay(2500 + Math.random() * 2500);

                      const response = await this.page.goto(pageUrl, { waitUntil: "domcontentloaded" });
          
                      if (!response || !response.ok()) {
                        const status = response ? response.status() : "No Response";
                        console.warn(`! Fallo al cargar página ${i} (Status: ${status}).`);
                        continue;
                      }
                    await delay(1000);
          await this.page.waitForSelector("body");
          content = await this.page.content();
          await this.cache.save({ url: pageUrl, content, force: true, extension: ".html" });
        } else {
          console.log(`📦 Cache hit página ${i}/${pagination.totalPages}.`);
        }

        scrapedPages.push(pageUrl);

        // Parsear ediciones página actual
        const pageEditions = parseEditionsList(content);
        allEditions.push(...pageEditions);
        console.log(`📄 Página ${i}: ${pageEditions.length} ediciones encontradas.`);
      }
    }

    // --- Guardar Resultados de Ediciones ---
    await this.cache.save({
      url: baseUrlWithParams,
      content: JSON.stringify(allEditions, null, 2),
      force: true,
      extension: "-editions.json",
    });

    // --- Guardar Reporte de Metadata ---
    const metadata = {
      timestamp: new Date().toISOString(),
      legacyId,
      filters: { sort, format, language },
      stats: {
        totalPages: pagination.totalPages,
        scrapedUrls: scrapedPages,
        totalEditions: allEditions.length,
      },
    };

    await this.cache.save({
      url: baseUrlWithParams,
      content: JSON.stringify(metadata, null, 2),
      force: true,
      extension: "-filter-meta.json",
    });

    console.log(`✅ Proceso completado. ${allEditions.length} ediciones guardadas.`);
  }
}
