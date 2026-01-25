import { Database } from "bun:sqlite";

interface SqlArgs {
  blogId: string;
}

function parseArgs(): SqlArgs {
  const args: string[] = process.argv.slice(2);
  const params: SqlArgs = {
    blogId: "",
  };

  for (const arg of args) {
    if (arg.startsWith("--blogId=")) {
      params.blogId = arg.split("=")[1];
    } else if (!arg.startsWith("--") && !params.blogId) {
      params.blogId = arg;
    }
  }

  return params;
}

const db = new Database("library.sqlite");

console.log("📂 Base de datos abierta.\n");

export async function main(): Promise<void> {
  const { blogId } = parseArgs();

  if (!blogId) {
    console.error("❌ Error: Debes proporcionar un ID de blog.");
    process.exit(1);
  }

  try {
    const query = db.query(`
    SELECT
      e.book_legacy_id as 'Legacy Id',
      CASE 
        WHEN LENGTH(e.title) > 40 THEN SUBSTR(e.title, 1, 37) || '...' 
        ELSE e.title 
      END as Titulo,
      CASE
        WHEN e.format = 'Kindle Edition' THEN 'Kindle'
        WHEN LENGTH(e.format) > 10 THEN SUBSTR(e.format, 1, 7) || '...'
        ELSE e.format
      END as Format,
      b.average_rating as Rating,
      e.pages_count as Paginas,
      e.link as Link
    FROM blog_books bb
    INNER JOIN books b ON bb.book_id LIKE '%' || b.id || '%'
    INNER JOIN editions e ON b.legacy_id = e.book_legacy_id
    WHERE
      bb.blog_id = $blogIdArg
      AND e.language = 'Spanish'
      AND (
        e.format = 'ebook'
        OR e.format = 'Kindle Edition'
      )
  `);

    const data = query.all({ $blogIdArg: blogId });

    console.table(data);
  } catch (error) {
    console.error("❌ Error ejecutando consultas:", error);
  } finally {
    db.close();
    console.log("\n🔒 Base de datos cerrada.");
  }
}

// "3040-a-year-by-year-look-at-4-star-beloved-books-of-the-new-century";

await main();
