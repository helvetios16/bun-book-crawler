import { ansi } from "./logger";
import { Progress } from "./progress";
import type { BookRefLite, BookStage, BookState, PipelineReporter } from "./reporter";

const c = ansi;

export class PlainReporter implements PipelineReporter {
  private progress: Progress | null = null;
  private blogIdx = 0;
  private blogTotal = 0;

  onPipelineStart(
    blogIds: string[],
    options: { language?: string; formats?: string[]; checkOnly: boolean },
  ): void {
    const mode = options.checkOnly ? "Check Mode" : "Pipeline Mode";
    const lang = options.language ?? "spa";
    const fmts = (options.formats ?? []).join(",");
    console.log(
      `${c.heading(mode)} ${c.gray(`| ${blogIds.length} blog(s) | lang=${lang} formats=${fmts}`)}`,
    );
    if (!options.checkOnly) {
      console.log(`\n${c.heading("=== Phase 1: Scraping blogs ===")}`);
    }
  }

  onBlogStart(index: number, total: number, _blogId: string): void {
    this.blogIdx = index + 1;
    this.blogTotal = total;
    this.progress = null;
    console.log(c.gray(`\n[${this.blogIdx}/${this.blogTotal}]`));
  }

  onBlogTitle(title: string): void {
    console.log(`\n${c.heading(`Blog: ${title}`)}`);
  }

  onBlogBooks(books: BookRefLite[]): void {
    console.log(c.success(`  ${books.length} books found`));
    this.progress = new Progress(books.length);
  }

  onBookStart(_bookId: string, title: string): void {
    this.progress?.tick(title);
  }

  onBookStage(_bookId: string, _stage: BookStage): void {}

  onBookDone(
    _bookId: string,
    state: Exclude<BookState, "pending" | "in-progress">,
    message?: string,
  ): void {
    if (state === "skipped") {
      console.log(`  ${c.warn("Skipped:")} ${c.gray(message ?? "")}`);
    } else if (state === "error") {
      console.warn(`  ${c.warn("Error:")} ${c.gray(message ?? "")}`);
    }
    // "done" produces no extra line — the Progress ticker handles it
  }

  onBlogEnd(_stats: { ok: number; skipped: number; errors: number }): void {}

  onPipelineEnd(_summary: {
    errors: { blogId: string; bookId?: string; message: string }[];
  }): void {}
}
