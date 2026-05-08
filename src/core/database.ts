import { Database } from "bun:sqlite";
import type { Blog, Book, Edition } from "../types";
import { BlogRepository } from "./repositories/blog-repository";
import { BookRepository } from "./repositories/book-repository";
import { EditionRepository } from "./repositories/edition-repository";
import { MetadataRepository } from "./repositories/metadata-repository";
import { SessionRepository } from "./repositories/session-repository";

export class DatabaseService {
  private readonly db: Database;
  public readonly books: BookRepository;
  public readonly blogs: BlogRepository;
  public readonly editions: EditionRepository;
  public readonly sessions: SessionRepository;
  public readonly metadata: MetadataRepository;

  constructor(filename = "library.sqlite") {
    this.db = new Database(filename, { create: true });
    this.initSchema();

    // Initialize repositories
    this.books = new BookRepository(this.db);
    this.blogs = new BlogRepository(this.db);
    this.editions = new EditionRepository(this.db);
    this.sessions = new SessionRepository(this.db);
    this.metadata = new MetadataRepository(this.db);
  }

  private initSchema(): void {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA synchronous = NORMAL;");
    this.db.run("PRAGMA foreign_keys = ON;");
    this.db.run("PRAGMA cache_size = -64000;");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Schema version 1
    this.db.run("INSERT OR IGNORE INTO schema_version (version) VALUES (1)");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cookies TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

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

    this.db.run(`
      CREATE TABLE IF NOT EXISTS blogs (
        id TEXT PRIMARY KEY,
        url TEXT,
        title TEXT,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS blog_books (
        blog_id TEXT,
        book_id TEXT,
        PRIMARY KEY (blog_id, book_id)
      );
    `);

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

    this.db.run(`
      CREATE TABLE IF NOT EXISTS http_metadata (
        url_hash TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        etag TEXT,
        last_modified TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // --- MÉTODOS DE COMPATIBILIDAD (Fachada para no romper servicios actuales) ---

  public getDb(): Database {
    return this.db;
  }

  public getBook(id: string): Book | null {
    return this.books.getById(id);
  }
  public getAllBooks(): Book[] {
    return this.books.getAll();
  }
  public saveBook(book: Book): void {
    this.books.save(book);
  }
  public refreshBookTimestamp(id: string): void {
    this.books.refreshTimestamp(id);
  }

  public getAllBlogs(): Blog[] {
    return this.blogs.getAll();
  }
  public saveBlogReference(params: {
    blogId: string;
    bookId: string;
    blogTitle?: string;
    blogUrl?: string;
  }): void {
    this.blogs.saveReference(params);
  }

  public getEditions(legacyId: string | number, language?: string): Edition[] {
    return this.editions.getByLegacyId(legacyId, language);
  }
  public saveEditions(legacyId: string | number, editions: Edition[]): void {
    this.editions.saveMany(legacyId, editions);
  }
  public deleteEditions(legacyId: string | number, language?: string): void {
    this.editions.deleteByLegacyId(legacyId, language);
  }

  public getLatestSession() {
    return this.sessions.getLatest();
  }
  public saveSession(cookies: string): void {
    this.sessions.save(cookies);
  }

  public getHttpMetadata(hash: string) {
    return this.metadata.getByHash(hash);
  }
  public saveHttpMetadata(hash: string, url: string, etag?: string, lm?: string): void {
    this.metadata.save(hash, url, etag, lm);
  }
  public refreshHttpMetadata(hash: string): void {
    this.metadata.refresh(hash);
  }

  public reset(): void {
    this.db.run("DELETE FROM editions");
    this.db.run("DELETE FROM blog_books");
    this.db.run("DELETE FROM books");
    this.db.run("DELETE FROM blogs");
    this.db.run("DELETE FROM sessions");
    this.db.run("DELETE FROM http_metadata");
  }

  public purgeBook(bookId: string): void {
    const book = this.books.getById(bookId);
    if (!book) {
      return;
    }

    if (book.legacyId) {
      this.editions.deleteByLegacyId(book.legacyId);
    }
    this.db.prepare("DELETE FROM blog_books WHERE book_id = ?").run(bookId);
    this.books.delete(bookId);
  }

  public purgeBlog(blogId: string): void {
    const exclusiveBookIds = this.blogs.getExclusiveBookIds(blogId);

    for (const bookId of exclusiveBookIds) {
      const book = this.books.getById(bookId);
      if (book?.legacyId) {
        this.editions.deleteByLegacyId(book.legacyId);
      }
    }

    if (exclusiveBookIds.length > 0) {
      this.books.deleteMany(exclusiveBookIds);
    }

    this.db.prepare("DELETE FROM blog_books WHERE blog_id = ?").run(blogId);
    this.blogs.delete(blogId);
  }

  public close(): void {
    this.db.close();
  }
}
