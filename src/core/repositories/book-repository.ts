import type { Database, Statement } from "bun:sqlite";
import type { Book } from "../../types";

interface BookRow {
  id: string;
  legacy_id?: string;
  title: string;
  title_complete?: string;
  author?: string;
  description?: string;
  average_rating?: number;
  page_count?: number;
  language?: string;
  format?: string;
  cover_image?: string;
  updated_at: string;
}

export class BookRepository {
  private readonly saveStmt: Statement;
  private readonly getStmt: Statement;
  private readonly getAllStmt: Statement;
  private readonly refreshStmt: Statement;
  private readonly deleteStmt: Statement;

  constructor(private readonly db: Database) {
    this.saveStmt = this.db.prepare(`
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

    this.getStmt = this.db.prepare("SELECT * FROM books WHERE id = ?");
    this.getAllStmt = this.db.prepare("SELECT * FROM books");
    this.refreshStmt = this.db.prepare(
      "UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    );

    this.deleteStmt = this.db.prepare("DELETE FROM books WHERE id = ?");
  }

  public save(book: Book): void {
    this.saveStmt.run({
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

  public getById(id: string): Book | null {
    const row = this.getStmt.get(id) as BookRow | null;
    return row ? this.mapRow(row) : null;
  }

  public getAll(): Book[] {
    const rows = this.getAllStmt.all() as BookRow[];
    return rows.map((row) => this.mapRow(row));
  }

  public refreshTimestamp(id: string): void {
    this.refreshStmt.run(id);
  }

  public delete(id: string): void {
    this.deleteStmt.run(id);
  }

  public deleteMany(ids: string[]): void {
    const tx = this.db.transaction(() => {
      for (const id of ids) {
        this.deleteStmt.run(id);
      }
    });
    tx();
  }

  private mapRow(row: BookRow): Book {
    return {
      id: row.id,
      legacyId: row.legacy_id ? Number(row.legacy_id) : undefined,
      title: row.title,
      titleComplete: row.title_complete || undefined,
      author: row.author || undefined,
      description: row.description || undefined,
      averageRating: row.average_rating || undefined,
      pageCount: row.page_count || undefined,
      language: row.language || undefined,
      format: row.format || undefined,
      coverImage: row.cover_image || undefined,
      updatedAt: row.updated_at,
    };
  }
}
