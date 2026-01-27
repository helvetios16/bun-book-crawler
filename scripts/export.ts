import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const db = new Database("library.sqlite");
const EXPORT_DIR = join(process.cwd(), "exports");

interface ExportArgs {
  format: "csv" | "json";
  type: "books" | "full";
}

function parseArgs(): ExportArgs {
  const args = process.argv.slice(2);
  const params: ExportArgs = {
    format: "csv",
    type: "books",
  };

  for (const arg of args) {
    if (arg.startsWith("--format=")) {
      const val = arg.split("=")[1].toLowerCase();
      if (val === "json") {
        params.format = "json";
      }
    } else if (arg.startsWith("--type=")) {
      const val = arg.split("=")[1].toLowerCase();
      if (val === "full") {
        params.type = "full";
      }
    }
  }
  return params;
}

function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) {
    return "";
  }
  const firstRow = data[0];
  if (!firstRow) {
    return "";
  }
  const headers = Object.keys(firstRow).join(",");
  const rows = data.map((row) =>
    Object.values(row)
      .map((val) => {
        if (val === null || val === undefined) {
          return "";
        }
        const str = String(val).replace(/"/g, '""'); // Escape quotes
        return `"${str}"`; // Quote fields
      })
      .join(","),
  );
  return `${headers}\n${rows.join("\n")}`;
}

function runExport() {
  const { format, type } = parseArgs();

  if (!existsSync(EXPORT_DIR)) {
    mkdirSync(EXPORT_DIR);
  }

  console.log(`📦 Exporting data (${type}) to ${format.toUpperCase()}...`);

  let query = "";
  let filename = "";

  if (type === "books") {
    // Export only books with basic info
    query = `
      SELECT 
        id, legacy_id, title, author, average_rating, page_count, publication_date, 
        language, format, genres
      FROM books
      ORDER BY title ASC
    `;
    filename = `books_export_${new Date().toISOString().split("T")[0]}`;
  } else {
    // Export full data: Books joined with Editions found
    query = `
      SELECT 
        b.title as Book_Title,
        b.author as Author,
        b.average_rating as Rating,
        e.title as Edition_Title,
        e.language as Language,
        e.format as Format
      FROM books b
      LEFT JOIN editions e ON b.legacy_id = e.book_legacy_id
      WHERE e.id IS NOT NULL
      ORDER BY b.title ASC
    `;
    filename = `full_library_export_${new Date().toISOString().split("T")[0]}`;
  }

  try {
    const results = db.query(query).all();

    if (results.length === 0) {
      console.log("⚠️ No data found to export.");
      return;
    }

    let content = "";
    const finalPath = join(EXPORT_DIR, `${filename}.${format}`);

    if (format === "json") {
      content = JSON.stringify(results, null, 2);
    } else {
      content = toCSV(results);
    }

    writeFileSync(finalPath, content, "utf-8");
    console.log(`✅ Export successful! File saved to:\n   ${finalPath}`);
    console.log(`📊 Total rows exported: ${results.length}`);
  } catch (err: unknown) {
    console.error("❌ Export failed:", err instanceof Error ? err.message : String(err));
  } finally {
    db.close();
  }
}

runExport();
