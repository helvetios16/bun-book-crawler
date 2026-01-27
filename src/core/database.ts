import { Database } from "bun:sqlite";
import type { Book, Edition } from "../types";

/**
 * Represents a raw row from the 'books' table in SQLite.
 * Fields matching SQLite behavior (NULL -> null).
 */
interface BookRow {
  readonly id: string;
  readonly legacy_id?: string;
  readonly title: string;
  readonly title_complete?: string;
  readonly author?: string;
  readonly description?: string;
  readonly average_rating?: number;
  readonly page_count?: number;
  readonly language?: string;
  readonly format?: string;
  readonly cover_image?: string;
  readonly updated_at: string;
}

/**
 * Represents a raw row from the 'editions' table in SQLite.
 */
interface EditionRow {
  readonly id: number;
  readonly book_legacy_id?: string;
  readonly title: string;
  readonly link: string;
  readonly description?: string;
  readonly language?: string;
  readonly format?: string;
  readonly average_rating?: number;
  readonly pages_count?: number;
  readonly cover_image?: string;
  readonly created_at: string;
}

/**
 * Type guard for BookRow.
 */
function isBookRow(data: unknown): data is BookRow {
  const d = data as Record<string, unknown>;
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in d &&
    typeof d.id === "string" &&
    "title" in d &&
    typeof d.title === "string"
  );
}

/**
 * Type guard for EditionRow array.
 */
function isEditionRow(data: unknown): data is EditionRow {
  const d = data as Record<string, unknown>;
  return (
    typeof data === "object" &&
    data !== null &&
    "title" in d &&
    typeof d.title === "string" &&
    "link" in d &&
    typeof d.link === "string"
  );
}

export class DatabaseService {
  private readonly db: Database;

  constructor(filename = "library.sqlite") {
    this.db = new Database(filename, { create: true });
    this.init();
  }

  private init(): void {
    this.db.run("PRAGMA foreign_keys = ON;");

    // 1. Tabla de Libros
    this.db.run(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        legacy_id TEXT,
        title TEXT,
        title_complete TEXT,
        author TEXT,
        description TEXT,
        average_rating REAL,
        page_count INTEGER,
        language TEXT,
        format TEXT,
        cover_image TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabla de Blogs
    this.db.run(`
      CREATE TABLE IF NOT EXISTS blogs (
        id TEXT PRIMARY KEY,
        url TEXT,
        title TEXT,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Tabla Intermedia
    this.db.run(`
      CREATE TABLE IF NOT EXISTS blog_books (
        blog_id TEXT,
        book_id TEXT,
        PRIMARY KEY (blog_id, book_id)
      );
    `);

    // 4. Tabla de Ediciones
    this.db.run(`
      CREATE TABLE IF NOT EXISTS editions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_legacy_id TEXT,
        title TEXT,
        link TEXT,
        description TEXT,
        language TEXT,
        format TEXT,
        average_rating REAL,
        pages_count INTEGER,
        cover_image TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.run("CREATE INDEX IF NOT EXISTS idx_editions_book ON editions(book_legacy_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_editions_lang ON editions(language);");
  }

  // --- MÉTODOS DE LECTURA ---

  public getDb(): Database {
    return this.db;
  }

  public getBook(id: string): Book | null {
    const query = this.db.prepare("SELECT * FROM books WHERE id = ?");
    const result = query.get(id);

    if (!isBookRow(result)) {
      return null;
    }

    return {
      id: result.id,
      legacyId: result.legacy_id ? Number(result.legacy_id) : undefined,
      title: result.title,
      titleComplete: result.title_complete || undefined,
      author: result.author || undefined,
      description: result.description || undefined,
      averageRating: result.average_rating || undefined,
      pageCount: result.page_count || undefined,
      language: result.language || undefined,
      format: result.format || undefined,
      coverImage: result.cover_image || undefined,
      updatedAt: result.updated_at,
    };
  }

  public getEditions(legacyId: string | number, language?: string): Edition[] {
    let sql = "SELECT * FROM editions WHERE book_legacy_id = ?";
    const params: (string | number)[] = [String(legacyId)];

    if (language) {
      sql += " AND language = ?";
      params.push(language);
    }

    const query = this.db.prepare(sql);
    const results = query.all(...params);

    return (results as unknown[]).filter(isEditionRow).map((row) => ({
      title: row.title,
      link: row.link,
      description: row.description || undefined,
      language: row.language || undefined,
      format: row.format || undefined,
      averageRating: row.average_rating || undefined,
      pages: row.pages_count || undefined,
      coverImage: row.cover_image || undefined,
      createdAt: row.created_at,
    }));
  }

  // --- MÉTODOS DE ESCRITURA ---

  public saveBook(book: Book): void {
    const query = this.db.prepare(`
      INSERT INTO books (
        id, legacy_id, title, title_complete, author, description, 
        average_rating, page_count,
        language, format, cover_image, updated_at
      )
      VALUES (
        $id, $legacyId, $title, $titleComplete, $author, $description,
        $averageRating, $pageCount,
        $language, $format, $coverImage, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        legacy_id = excluded.legacy_id,
        title = excluded.title,
        average_rating = excluded.average_rating,
        updated_at = CURRENT_TIMESTAMP;
    `);

    query.run({
      $id: book.id,
      $legacyId: book.legacyId?.toString() || null,
      $title: book.title,
      $titleComplete: book.titleComplete || null,
      $author: book.author || null,
      $description: book.description || null,
      $averageRating: book.averageRating || null,
      $pageCount: book.pageCount || null,
      $language: book.language || null,
      $format: book.format || null,
      $coverImage: book.coverImage || null,
    });
  }

  public saveEditions(legacyId: string | number, editions: Edition[]): void {
    const insert = this.db.prepare(`
      INSERT INTO editions (
        book_legacy_id, title, link, description, 
        language, format, average_rating, pages_count, cover_image
      )
      VALUES (
        $legacyId, $title, $link, $description,
        $language, $format, $rating, $pages, $coverImage
      );
    `);

    const transaction = this.db.transaction((items: Edition[]) => {
      for (const ed of items) {
        insert.run({
          $legacyId: String(legacyId),
          $title: ed.title,
          $link: ed.link,
          $description: ed.description || null,
          $language: ed.language || null,
          $format: ed.format || null,
          $rating: ed.averageRating || 0,
          $pages: ed.pages || 0,
          $coverImage: ed.coverImage || null,
        });
      }
    });

    transaction(editions);
  }

  public deleteEditions(legacyId: string | number, language?: string): void {
    let sql = "DELETE FROM editions WHERE book_legacy_id = ?";
    const params: (string | number)[] = [String(legacyId)];

    if (language) {
      sql += " AND language = ?";
      params.push(language);
    }

    const query = this.db.prepare(sql);
    query.run(...params);
  }

  public saveBlogReference(params: {
    blogId: string;
    bookId: string;
    blogTitle?: string;
    blogUrl?: string;
  }): void {
    const { blogId, bookId, blogTitle, blogUrl } = params;

    const insertBlog = this.db.prepare(`
      INSERT INTO blogs (id, title, url) 
      VALUES ($id, $title, $url)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title;
    `);

    insertBlog.run({
      $id: blogId,
      $title: blogTitle || "Unknown Blog",
      $url: blogUrl || "",
    });

    const insertRel = this.db.prepare(`
      INSERT OR IGNORE INTO blog_books (blog_id, book_id) VALUES ($blogId, $bookId);
    `);

    insertRel.run({
      $blogId: blogId,
      $bookId: bookId,
    });
  }

  public close(): void {
    this.db.close();
  }
}
