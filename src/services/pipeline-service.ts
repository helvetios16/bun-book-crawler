import type { DatabaseService } from "../core/database";
import type { Book, BookFilterOptions, Edition } from "../types";
import { NULL_REPORTER, type PipelineReporter } from "../utils/reporter";
import type { BlogService } from "./blog-service";
import type { BookService } from "./book-service";
import type { EditionService } from "./edition-service";

export interface PipelineOptions {
  language: string;
  formats: string[];
  sort: string;
  checkOnly?: boolean;
  force?: boolean;
}

export interface PipelineResult {
  books: Book[];
  errors: PipelineError[];
}

export interface PipelineError {
  blogId?: string;
  id: string;
  title: string;
  error: string;
}

export interface BookReport extends Book {
  editionsFound: Edition[];
  blogs: { id: string; title: string; url: string }[];
}

export interface FinalReportOutput {
  generatedAt: string;
  count: number;
  blogs: { id: string; title: string; url: string }[];
  books: BookReport[];
}

export class PipelineService {
  constructor(
    private readonly blogService: BlogService,
    private readonly bookService: BookService,
    private readonly editionService: EditionService,
    private readonly dbService: DatabaseService,
    private readonly reporter: PipelineReporter = NULL_REPORTER,
  ) {}

  /**
   * Ejecuta el proceso de scraping para un blog.
   */
  public async processBlog(blogId: string, options: PipelineOptions): Promise<PipelineResult> {
    const { language, formats, sort, checkOnly = false, force = false } = options;

    const blogData = await this.blogService.scrapeBlog(blogId);
    if (!blogData) {
      this.reporter.onBlogTitle(blogId);
      this.reporter.onBlogBooks([]);
      this.reporter.onBlogEnd({ ok: 0, skipped: 0, errors: 1 });
      return {
        books: [],
        errors: [{ id: blogId, title: "Unknown", error: "Failed to scrape blog" }],
      };
    }

    this.reporter.onBlogTitle(blogData.title || blogId);

    const books: Book[] = blogData.mentionedBooks || [];
    this.reporter.onBlogBooks(books.map((b) => ({ id: b.id, title: b.title })));

    const processedBooks: Book[] = [];
    const errors: PipelineError[] = [];
    let okCount = 0;
    let skippedCount = 0;

    for (const bookRef of books) {
      const bookTitle = bookRef.title || bookRef.id;
      this.reporter.onBookStart(bookRef.id, bookTitle);

      try {
        const bookDetails = await this.bookService.scrapeBook(bookRef.id);
        if (!bookDetails) {
          throw new Error(`Failed to get details for book ${bookRef.id}`);
        }

        if (bookDetails.legacyId) {
          this.reporter.onBookStage(bookRef.id, "filters");
          const filters = await this.editionService.scrapeEditionsFilters(bookDetails.legacyId);

          if (filters && !force) {
            const hasLanguage = filters.language.some((l) => l.value === language);
            const availableFormats =
              formats.length > 0
                ? formats.filter((f) => filters.format.some((af) => af.value === f))
                : [];

            const canProcess = hasLanguage && (formats.length === 0 || availableFormats.length > 0);

            if (!canProcess) {
              const reason = !hasLanguage
                ? `Language '${language}' not found`
                : `Format(s) '${formats.join(",")}' not found`;
              this.reporter.onBookDone(bookRef.id, "skipped", reason);
              skippedCount++;
              continue;
            }

            if (checkOnly) {
              this.reporter.onBookDone(bookRef.id, "done");
              processedBooks.push(bookDetails);
              okCount++;
              continue;
            }
          }

          if (!checkOnly) {
            this.reporter.onBookStage(bookRef.id, "editions");
            const formatsToProcess = formats.length > 0 ? formats : [undefined];
            for (const format of formatsToProcess) {
              const filterOptions: BookFilterOptions = {
                language,
                sort,
                format,
              };
              await this.editionService.scrapeFilteredEditions(bookDetails.legacyId, filterOptions);
            }
          }
        }

        processedBooks.push(bookDetails);
        this.reporter.onBookDone(bookRef.id, "done");
        okCount++;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.reporter.onBookDone(bookRef.id, "error", errorMessage);
        errors.push({
          id: bookRef.id,
          title: bookRef.title || "Unknown",
          error: errorMessage,
        });
      }
    }

    this.reporter.onBlogEnd({ ok: okCount, skipped: skippedCount, errors: errors.length });
    return { books: processedBooks, errors };
  }

  /**
   * Genera el reporte combinado basado en los blogs procesados.
   */
  public generateReport(targetBlogIds: string[], language: string): FinalReportOutput {
    const db = this.dbService.getDb();
    const booksByCanonicalKey = new Map<string, BookReport>();

    let querySql = `
      SELECT bb.book_id, b.id as blog_id, b.title as blog_title, b.url as blog_url
      FROM blog_books bb
      JOIN blogs b ON bb.blog_id = b.id
    `;

    const queryParams: string[] = [];
    if (targetBlogIds.length > 0) {
      const placeholders = targetBlogIds.map(() => "?").join(",");
      querySql += ` WHERE b.id IN (${placeholders})`;
      queryParams.push(...targetBlogIds);
    }

    type BlogRelationRow = {
      book_id: string;
      blog_id: string;
      blog_title: string;
      blog_url: string;
    };

    const allBlogRelations = db.prepare(querySql).all(...queryParams) as BlogRelationRow[];

    const blogsByBookId = new Map<string, { id: string; title: string; url: string }[]>();
    for (const rel of allBlogRelations) {
      const normalizedBookId = rel.book_id.match(/^\d+/)?.[0] || rel.book_id;
      if (!blogsByBookId.has(normalizedBookId)) {
        blogsByBookId.set(normalizedBookId, []);
      }
      blogsByBookId.get(normalizedBookId)?.push({
        id: rel.blog_id,
        title: rel.blog_title,
        url: rel.blog_url,
      });
    }

    const allBooks = this.dbService.getAllBooks();
    const filteredBooks =
      targetBlogIds.length > 0
        ? allBooks.filter((b) => {
            const normalizedId = b.id.match(/^\d+/)?.[0] || b.id;
            return blogsByBookId.has(normalizedId);
          })
        : allBooks;

    for (const book of filteredBooks) {
      const canonicalKey = `${book.title}-${book.author}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedBookId = book.id.match(/^\d+/)?.[0] || book.id;
      const relatedBlogs = blogsByBookId.get(normalizedBookId) || [];

      let editions: Edition[] = [];
      if (book.legacyId) {
        editions = this.dbService.getEditions(book.legacyId, language || undefined);
      }

      const existing = booksByCanonicalKey.get(canonicalKey);
      if (existing) {
        for (const blog of relatedBlogs) {
          if (!existing.blogs.some((b) => b.id === blog.id)) {
            existing.blogs.push(blog);
          }
        }
        for (const edition of editions) {
          if (!existing.editionsFound.some((e) => e.link === edition.link)) {
            existing.editionsFound.push(edition);
          }
        }
      } else {
        booksByCanonicalKey.set(canonicalKey, {
          ...book,
          blogs: relatedBlogs,
          editionsFound: editions,
        });
      }
    }

    const finalBooks = Array.from(booksByCanonicalKey.values());
    const blogsInReport = new Map<string, { id: string; title: string; url: string }>();
    for (const book of finalBooks) {
      for (const blog of book.blogs) {
        if (!blogsInReport.has(blog.id)) {
          blogsInReport.set(blog.id, blog);
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      count: finalBooks.length,
      blogs: Array.from(blogsInReport.values()).sort((a, b) => a.title.localeCompare(b.title)),
      books: finalBooks,
    };
  }
}
