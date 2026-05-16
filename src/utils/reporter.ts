export type BookState = "pending" | "in-progress" | "done" | "skipped" | "error";
export type BookStage = "filters" | "editions";

export interface BookRefLite {
  id: string;
  title?: string;
}

export interface PipelineReporter {
  onPipelineStart(
    blogIds: string[],
    options: { language?: string; formats?: string[]; checkOnly: boolean },
  ): void;
  onBlogStart(index: number, total: number, blogId: string): void;
  onBlogTitle(title: string): void;
  onBlogBooks(books: BookRefLite[]): void;
  onBookStart(bookId: string, title: string): void;
  onBookStage(bookId: string, stage: BookStage): void;
  onBookDone(
    bookId: string,
    state: Exclude<BookState, "pending" | "in-progress">,
    message?: string,
  ): void;
  onBlogEnd(stats: { ok: number; skipped: number; errors: number }): void;
  onPipelineEnd(summary: { errors: { blogId: string; bookId?: string; message: string }[] }): void;
}

export const NULL_REPORTER: PipelineReporter = {
  onPipelineStart: () => {},
  onBlogStart: () => {},
  onBlogTitle: () => {},
  onBlogBooks: () => {},
  onBookStart: () => {},
  onBookStage: () => {},
  onBookDone: () => {},
  onBlogEnd: () => {},
  onPipelineEnd: () => {},
};
