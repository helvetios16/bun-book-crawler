import type { Database, Statement } from "bun:sqlite";
import type { Blog } from "../../types";

interface BlogRow {
  id: string;
  url: string;
  title: string;
  scraped_at: string;
}

export class BlogRepository {
  private readonly saveBlogStmt: Statement;
  private readonly saveRelStmt: Statement;
  private readonly getAllStmt: Statement;
  private readonly deleteStmt: Statement;
  private readonly exclusiveBooksStmt: Statement;

  constructor(private readonly db: Database) {
    this.saveBlogStmt = this.db.prepare(`
      INSERT INTO blogs (id, title, url)
      VALUES ($id, $title, $url)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title;
    `);

    this.saveRelStmt = this.db.prepare(`
      INSERT OR IGNORE INTO blog_books (blog_id, book_id) VALUES ($blogId, $bookId);
    `);

    this.getAllStmt = this.db.prepare("SELECT * FROM blogs");

    this.deleteStmt = this.db.prepare("DELETE FROM blogs WHERE id = ?");

    this.exclusiveBooksStmt = this.db.prepare(`
      SELECT book_id FROM blog_books
      WHERE blog_id = ?
      AND book_id NOT IN (
        SELECT book_id FROM blog_books WHERE blog_id != ?
      )
    `);
  }

  public saveReference(params: {
    blogId: string;
    bookId: string;
    blogTitle?: string;
    blogUrl?: string;
  }): void {
    const { blogId, bookId, blogTitle, blogUrl } = params;

    this.saveBlogStmt.run({
      $id: blogId,
      $title: blogTitle || "Unknown Blog",
      $url: blogUrl || "",
    });

    this.saveRelStmt.run({
      $blogId: blogId,
      $bookId: bookId,
    });
  }

  public getAll(): Blog[] {
    const rows = this.getAllStmt.all() as BlogRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      webUrl: row.url,
      createdAt: row.scraped_at,
    }));
  }

  public delete(id: string): void {
    this.deleteStmt.run(id);
  }

  public getExclusiveBookIds(blogId: string): string[] {
    const rows = this.exclusiveBooksStmt.all(blogId, blogId) as { book_id: string }[];
    return rows.map((r) => r.book_id);
  }
}
