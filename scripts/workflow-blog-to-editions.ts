import { BLOG_URL, GOODREADS_URL, WORK_URL } from "../src/config/constants";
import { BrowserClient } from "../src/core/browser-client";
import { CacheManager } from "../src/core/cache-manager";
import { GoodreadsService } from "../src/services/goodreads-service";
import { Blog, Book, BookFilterOptions, Edition } from "../src/types";

/**
 * Interface for the final book report item.
 */
interface BookReport extends Book {
  editionsFound: Edition[];
  processingError?: string;
  sourceBlogId: string;
}

/**
 * Interface for parsed command line arguments.
 */
interface WorkflowArgs {
  blogId: string;
  language: string;
  format: string;
  sort: string;
}

/**
 * Parses command line arguments for the workflow.
 * @returns {WorkflowArgs} The parsed arguments.
 */
function parseArgs(): WorkflowArgs {
  const args: string[] = process.argv.slice(2);
  const params: WorkflowArgs = {
    blogId: "",
    language: "spa",
    format: "",
    sort: "num_ratings",
  };

  for (const arg of args) {
    if (arg.startsWith("--blogId=")) {
      params.blogId = arg.split("=")[1];
    } else if (arg.startsWith("--language=")) {
      params.language = arg.split("=")[1];
    } else if (arg.startsWith("--format=")) {
      params.format = arg.split("=")[1];
    } else if (arg.startsWith("--sort=")) {
      params.sort = arg.split("=")[1];
    } else if (!arg.startsWith("--") && !params.blogId) {
      params.blogId = arg;
    }
  }

  return params;
}

async function main(): Promise<void> {
  const { blogId, language, format, sort } = parseArgs();

  if (!blogId) {
    console.error("❌ Error: Debes proporcionar un ID de blog.");
    process.exit(1);
  }

  console.log(`🚀 Iniciando flujo de trabajo para Blog ID: ${blogId}`);
  console.log(
    `⚙  Filtros de edición: Idioma=${language}, Formato=${format || "Cualquiera"}, Sort=${sort}`,
  );

  const browserClient = new BrowserClient();
  const cache = new CacheManager();
  const finalReport: BookReport[] = [];

  try {
    const page = await browserClient.launch();
    page.setDefaultNavigationTimeout(60000);
    const service = new GoodreadsService(page);

    // 1. Scrape del Blog
    console.log("\n📚 PASO 1: Analizando Blog...");
    await service.scrapeBlog(blogId);

    const blogUrl = `${GOODREADS_URL}${BLOG_URL}${blogId}`;
    const blogDataJson = await cache.get(blogUrl, "-parsed.json");

    if (!blogDataJson) {
      throw new Error("❌ No se pudieron recuperar los datos del blog de la caché.");
    }

    const blogData: Blog = JSON.parse(blogDataJson);
    const books: (Book & { section?: string })[] = blogData.mentionedBooks || [];

    console.log(`✅ Blog analizado. Se encontraron ${books.length} libros mencionados.`);

    // 2. Procesar cada libro
    console.log("\n📖 PASO 2: Procesando libros y buscando ediciones...");

    for (const [index, bookRef] of books.entries()) {
      console.log(`\n---------------------------------------------------------`);
      console.log(
        `Processing Book ${index + 1}/${books.length}: ID ${bookRef.id} - "${bookRef.title || "Desconocido"}"`,
      );

      const bookReportItem: BookReport = {
        ...bookRef,
        sourceBlogId: blogId,
        editionsFound: [],
      };

      try {
        // Scrape del libro
        const bookDetails = await service.scrapeBook(bookRef.id);

        if (!bookDetails) {
            throw new Error(`No se pudieron obtener detalles para el libro ${bookRef.id}`);
        }

        // Actualizar info del libro con datos más detallados
        Object.assign(bookReportItem, bookDetails);

        if (!bookDetails.legacyId) {
          throw new Error("No se encontró Legacy ID (Work ID)");
        }

        const legacyId = bookDetails.legacyId;
        console.log(`🔹 Work ID encontrado: ${legacyId}`);
        console.log(`🔍 Buscando ediciones en idioma '${language}'...`);

        // Scrape Filtros (Metadata)
        await service.scrapeEditionsFilters(legacyId);

        // Scrape Ediciones Filtradas
        const filterOptions: BookFilterOptions = {
          language: language,
          sort: sort,
          format: format || undefined,
        };

        await service.scrapeFilteredEditions(legacyId, filterOptions);

        // Recuperar ediciones guardadas en caché
        const query = new URLSearchParams();
        query.append("utf8", "✓");
        query.append("sort", sort);
        if (format) query.append("filter_by_format", format);
        if (language) query.append("filter_by_language", language);

        const editionsUrlKey = `${GOODREADS_URL}${WORK_URL}${legacyId}?${query.toString()}`;
        const editionsJson = await cache.get(editionsUrlKey, "-editions.json");
        
        if (editionsJson) {
          const editions: Edition[] = JSON.parse(editionsJson);
          bookReportItem.editionsFound = editions;
          console.log(`✅ ${editions.length} ediciones agregadas al reporte.`);
        } else {
            console.warn("⚠️ No se encontró el archivo de ediciones en caché.");
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`❌ Error procesando libro ${bookRef.id}: ${errorMessage}`);
        bookReportItem.processingError = errorMessage;
      } finally {
        finalReport.push(bookReportItem);
      }
    }

    // 3. Generar JSON Final
    console.log("\n💾 PASO 3: Guardando reporte final...");
    const reportFilename = `report-${blogId}-${language}.json`;
    
    const fs = await import("node:fs");
    const path = await import("node:path");
    const finalPath = path.resolve(process.cwd(), reportFilename);
    
    fs.writeFileSync(finalPath, JSON.stringify(finalReport, null, 2));

    console.log(`🎉 Reporte guardado exitosamente en: ${finalPath}`);
    console.log(`📊 Total libros procesados: ${finalReport.length}`);
    console.log(`📚 Libros con ediciones encontradas: ${finalReport.filter(b => b.editionsFound.length > 0).length}`);

  } catch (error: unknown) {
    const fatalMessage = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error fatal en el flujo de trabajo:", fatalMessage);
  } finally {
    await browserClient.close();
  }
}

main();
