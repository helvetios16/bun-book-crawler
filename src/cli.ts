#!/usr/bin/env bun
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cac } from "cac";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const cli = cac("bukcraw");

/**
 * Ejecuta un script de la carpeta scripts/ enviando los argumentos correspondientes.
 */
function runScript(scriptPath: string, args: string[]) {
  const fullPath = path.resolve(PROJECT_ROOT, scriptPath);

  const child = spawn("bun", ["run", fullPath, ...args], {
    stdio: "inherit",
    cwd: PROJECT_ROOT, // Forzamos que el script se ejecute en la raíz del proyecto
    env: process.env,
  });

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      process.exit(code);
    }
  });
}

// --- Comandos ---

// 1. Pipeline (Blog -> Books -> Editions -> Report)
cli
  .command("run [...blogs]", "Ejecuta el pipeline sobre uno o varios blogs")
  .option("--language <lang>", "Código de idioma", { default: "spa" })
  .option("--format <fmt>", "Formato (ebook, hardcover, Kindle Edition, etc.)", {
    default: "ebook,Kindle Edition",
  })
  .option("--sort <order>", "Orden de las ediciones (num_ratings, avg_rating, publish_date)")
  .option("--report", "Generar reporte final (desactivado por defecto)")
  .option("--output <path>", "Ruta del archivo de salida")
  .option("--force", "Forzar scraping completo ignorando validaciones de formato")
  .action((blogs, options) => {
    const args: string[] = [];
    if (blogs.length > 0) {
      args.push(...blogs);
    }
    if (options.language) {
      args.push(`--language=${options.language}`);
    }
    if (options.format) {
      args.push(`--format=${options.format}`);
    }
    if (options.sort) {
      args.push(`--sort=${options.sort}`);
    }
    if (options.force) {
      args.push("--force");
    }
    if (options.report) {
      args.push("--report");
    }
    if (options.output) {
      args.push(`--output=${options.output}`);
    }

    runScript("scripts/cli/pipeline.ts", args);
  });

// 2. Check (Fast verification)
cli
  .command("check [...blogs]", "Verifica disponibilidad de formatos sin scrapear ediciones")
  .option("--language <lang>", "Código de idioma", { default: "spa" })
  .option("--format <fmt>", "Formato (ebook, Kindle Edition, etc.)", {
    default: "ebook,Kindle Edition",
  })
  .action((blogs, options) => {
    const args: string[] = ["--check-only"];
    if (blogs.length > 0) {
      args.push(...blogs);
    }
    if (options.language) {
      args.push(`--language=${options.language}`);
    }
    if (options.format) {
      args.push(`--format=${options.format}`);
    }

    runScript("scripts/cli/pipeline.ts", args);
  });

// 3. Report (Database relations)
cli
  .command("report", "Genera el reporte de relaciones desde la base de datos")
  .option("--language <lang>", "Filtrar ediciones por idioma")
  .option("--blogs <ids>", "IDs de blogs separados por coma")
  .option("--sort <type>", "Orden de los blogs (date, name, id)", { default: "date" })
  .option("--output <path>", "Nombre del archivo de salida")
  .action((options) => {
    const args: string[] = [];
    if (options.language) {
      args.push(`--language=${options.language}`);
    }
    if (options.blogs) {
      args.push(`--blogs=${options.blogs}`);
    }
    if (options.sort) {
      args.push(`--sort=${options.sort}`);
    }
    if (options.output) {
      args.push(`--output=${options.output}`);
    }

    runScript("scripts/cli/report-books-relations.ts", args);
  });

// 4. Cache
cli.command("cache:clear", "Limpia la caché de descargas").action(() => {
  runScript("scripts/cache/clear.ts", []);
});

// 5. DB management
cli
  .command("db:reset", "Borra todo el contenido de la base de datos")
  .option("--force", "Omitir confirmación interactiva")
  .action((options) => {
    const args: string[] = [];
    if (options.force) {
      args.push("--force");
    }
    runScript("scripts/db/reset.ts", args);
  });

cli
  .command("db:delete-book", "Busca y borra libros junto a sus ediciones y referencias")
  .option("--force", "Omitir confirmación interactiva")
  .action((options) => {
    const args: string[] = [];
    if (options.force) {
      args.push("--force");
    }
    runScript("scripts/db/delete-book.ts", args);
  });

cli
  .command("db:delete-blog", "Selecciona y borra blogs junto a sus libros exclusivos")
  .option("--force", "Omitir confirmación interactiva")
  .action((options) => {
    const args: string[] = [];
    if (options.force) {
      args.push("--force");
    }
    runScript("scripts/db/delete-blog.ts", args);
  });

// 6. Workflow (Legacy / Single blog)
cli
  .command("workflow <blogId>", "Ejecuta el flujo para un solo blog (legacy)")
  .option("--language <lang>", "Código de idioma", { default: "spa" })
  .option("--format <fmt>", "Formato")
  .action((blogId, options) => {
    const args: string[] = [blogId];
    if (options.language) {
      args.push(`--language=${options.language}`);
    }
    if (options.format) {
      args.push(`--format=${options.format}`);
    }

    runScript("scripts/cli/workflow-blog-to-editions.ts", args);
  });

cli.help();
cli.version("1.0.0");

try {
  cli.parse();
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`\x1b[31mError:\x1b[0m ${message}`);
  process.exit(1);
}
