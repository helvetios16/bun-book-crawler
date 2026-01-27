import { Database } from "bun:sqlite";

const db = new Database("library.sqlite");

const command = process.argv[2] || "stats";
const arg = process.argv[3];

console.log(`🔍 Ejecutando consulta: ${command.toUpperCase()}\n`);

interface CountResult {
  count: number;
}

try {
  switch (command) {
    case "stats": {
      const booksCount = db.query("SELECT COUNT(*) as count FROM books").get() as CountResult;
      const editionsCount = db.query("SELECT COUNT(*) as count FROM editions").get() as CountResult;
      const blogsCount = db.query("SELECT COUNT(*) as count FROM blogs").get() as CountResult;

      console.table([
        { Entity: "Libros (Books)", Count: booksCount.count },
        { Entity: "Ediciones (Editions)", Count: editionsCount.count },
        { Entity: "Blogs Rastraedos", Count: blogsCount.count },
      ]);
      break;
    }

    case "books": {
      const books = db
        .query("SELECT id, title, author, legacy_id, average_rating FROM books LIMIT 20")
        .all();
      console.table(books);
      break;
    }

    case "editions": {
      if (!arg) {
        console.error(
          "❌ Debes proporcionar un Work ID (Legacy ID). Ejemplo: bun scripts/query-db.ts editions 66322",
        );
        break;
      }
      const editions = db
        .query(
          "SELECT id, title, language, format, average_rating FROM editions WHERE book_legacy_id = ?",
        )
        .all(arg);
      if (editions.length === 0) {
        console.log("No se encontraron ediciones para ese ID.");
      } else {
        console.table(editions);
      }
      break;
    }

    case "blogs": {
      // Consulta con JOIN para ver cuántos libros tiene cada blog
      const blogs = db
        .query(`
        SELECT b.title, b.url, COUNT(bb.book_id) as book_count 
        FROM blogs b
        LEFT JOIN blog_books bb ON b.id = bb.blog_id
        GROUP BY b.id
      `)
        .all();
      console.table(blogs);
      break;
    }

    case "rel": {
      // Ver qué libros pertenecen a qué blog
      const relations = db
        .query(`
        SELECT blogs.title as Blog, books.title as Book 
        FROM blog_books 
        JOIN blogs ON blog_books.blog_id = blogs.id
        JOIN books ON blog_books.book_id = books.id
        LIMIT 20
      `)
        .all();
      console.table(relations);
      break;
    }

    default:
      console.log("Comandos disponibles:");
      console.log("  stats       - Ver contadores totales");
      console.log("  books       - Ver últimos 20 libros");
      console.log("  blogs       - Ver blogs analizados");
      console.log("  rel         - Ver relación Blog <-> Libros");
      console.log("  editions <ID> - Ver ediciones de un Work ID específico");
      break;
  }
} catch (error) {
  console.error("Error consultando la BD:", error);
} finally {
  db.close();
}
