import { ansi, type LogLevel, setLoggerSink } from "./logger";
import type { BookRefLite, BookStage, BookState, PipelineReporter } from "./reporter";

interface BookEntry {
  id: string;
  title: string;
  state: BookState;
}

const STAGE_LABELS: Record<BookStage, string> = {
  filters: "checking filters",
  editions: "scraping editions",
};

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.ceil(secs % 60);
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

const ESC = "\x1b";
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
const ANSI_RE = /\x1b\[[0-9;]*[mA-Za-z]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
const ANSI_RE_ONE = /^\x1b\[[0-9;]*[mA-Za-z]/;

function visibleLen(str: string): number {
  return str.replace(ANSI_RE, "").length;
}

function truncVis(str: string, max: number): string {
  let visible = 0;
  let result = "";
  let i = 0;
  while (i < str.length) {
    if (str[i] === ESC) {
      const m = str.slice(i).match(ANSI_RE_ONE);
      if (m) {
        result += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (visible >= max) {
      break;
    }
    result += str[i];
    visible++;
    i++;
  }
  return `${result}\x1b[0m`;
}

export class GridReporter implements PipelineReporter {
  private books: BookEntry[] = [];
  private bookIndex = new Map<string, number>();

  private blogIdx = 0;
  private blogTotal = 0;
  private blogId = "";
  private blogTitle = "";
  private language = "";
  private formats: string[] = [];
  private checkOnly = false;

  private currentBookId: string | null = null;
  private currentStage: BookStage | null = null;

  private doneCount = 0;
  private skippedCount = 0;
  private errorCount = 0;

  private bookStartTimes = new Map<string, number>();
  private durations: number[] = [];

  private logLines: string[] = [];
  private readonly LOG_MAX = 8;

  private linesRendered = -1;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private cleanedUp = false;

  /** Number of times 'q' has been pressed; quits after QUIT_PRESSES_REQUIRED. */
  private quitPresses = 0;
  private readonly QUIT_PRESSES_REQUIRED = 3;
  private rawModeEnabled = false;

  private readonly resizeHandler = () => this.scheduleRender();
  private readonly sigintHandler = () => {
    this.cleanup();
    process.exit(130);
  };

  private readonly keyHandler = (data: Buffer) => {
    const key = data.toString();
    // Ctrl+C — raw mode swallows SIGINT, so handle it here too.
    if (key === "\x03") {
      this.cleanup();
      process.exit(130);
      return;
    }
    if (key === "q" || key === "Q") {
      this.quitPresses++;
      const remaining = this.QUIT_PRESSES_REQUIRED - this.quitPresses;
      if (remaining <= 0) {
        this.pushLog("warn", "bukcraw", "Saliendo...");
        this.cleanup();
        process.exit(130);
        return;
      }
      this.pushLog(
        "warn",
        "bukcraw",
        `Presiona 'q' ${remaining} ${remaining === 1 ? "vez" : "veces"} más para salir`,
      );
    }
  };

  onPipelineStart(
    _blogIds: string[],
    options: { language?: string; formats?: string[]; checkOnly: boolean },
  ): void {
    this.language = options.language ?? "spa";
    this.formats = options.formats ?? [];
    this.checkOnly = options.checkOnly;

    process.stdout.write("\x1b[?25l");
    setLoggerSink((level: LogLevel, source: string, message: string) => {
      this.pushLog(level, source, message);
    });
    process.on("SIGINT", this.sigintHandler);
    process.on("exit", () => process.stdout.write("\x1b[?25h"));
    process.stdout.on("resize", this.resizeHandler);

    // Listen for 'q' (×3) to quit safely without killing the run mid-write.
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      this.rawModeEnabled = true;
      process.stdin.resume();
      process.stdin.on("data", this.keyHandler);
      // Don't keep the event loop alive just for stdin once the pipeline finishes.
      process.stdin.unref();
    }
  }

  onBlogStart(index: number, total: number, blogId: string): void {
    if (this.linesRendered >= 0) {
      this.finalizeCurrentBlog();
    }
    this.books = [];
    this.bookIndex.clear();
    this.blogIdx = index + 1;
    this.blogTotal = total;
    this.blogId = blogId;
    this.blogTitle = blogId;
    this.currentBookId = null;
    this.currentStage = null;
    this.doneCount = 0;
    this.skippedCount = 0;
    this.errorCount = 0;
    this.bookStartTimes.clear();
    this.durations = [];
    this.logLines = [];
    this.linesRendered = -1;
  }

  onBlogTitle(title: string): void {
    this.blogTitle = title;
    this.scheduleRender();
  }

  onBlogBooks(books: BookRefLite[]): void {
    this.books = books.map((b) => ({
      id: b.id,
      title: b.title ?? b.id,
      state: "pending" as BookState,
    }));
    for (let i = 0; i < this.books.length; i++) {
      this.bookIndex.set(this.books[i].id, i);
    }
    this.render();
  }

  onBookStart(bookId: string, title: string): void {
    this.currentBookId = bookId;
    this.currentStage = null;
    this.bookStartTimes.set(bookId, Date.now());
    const idx = this.bookIndex.get(bookId);
    if (idx !== undefined) {
      this.books[idx].state = "in-progress";
      this.books[idx].title = title;
    }
    this.scheduleRender();
  }

  onBookStage(bookId: string, stage: BookStage): void {
    if (this.currentBookId === bookId) {
      this.currentStage = stage;
    }
    this.scheduleRender();
  }

  onBookDone(
    bookId: string,
    state: Exclude<BookState, "pending" | "in-progress">,
    _message?: string,
  ): void {
    const start = this.bookStartTimes.get(bookId);
    if (start) {
      const dur = (Date.now() - start) / 1000;
      this.durations.push(dur);
      if (this.durations.length > 5) {
        this.durations.shift();
      }
    }
    const idx = this.bookIndex.get(bookId);
    if (idx !== undefined) {
      this.books[idx].state = state;
    }

    if (state === "done") {
      this.doneCount++;
    } else if (state === "skipped") {
      this.skippedCount++;
    } else if (state === "error") {
      this.errorCount++;
    }

    if (this.currentBookId === bookId) {
      this.currentBookId = null;
      this.currentStage = null;
    }
    this.render();
  }

  onBlogEnd(_stats: { ok: number; skipped: number; errors: number }): void {
    this.render();
  }

  onPipelineEnd(_summary: {
    errors: { blogId: string; bookId?: string; message: string }[];
  }): void {
    this.finalizeCurrentBlog();
    this.cleanup();
  }

  private finalizeCurrentBlog(): void {
    if (this.linesRendered >= 0) {
      process.stdout.write("\n");
    }
    this.linesRendered = -1;
  }

  private cleanup(): void {
    if (this.cleanedUp) {
      return;
    }
    this.cleanedUp = true;
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    setLoggerSink(null);
    process.stdout.off("resize", this.resizeHandler);
    process.removeListener("SIGINT", this.sigintHandler);
    if (this.rawModeEnabled) {
      process.stdin.off("data", this.keyHandler);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      this.rawModeEnabled = false;
    }
    process.stdout.write("\x1b[?25h");
  }

  private pushLog(level: LogLevel, source: string, message: string): void {
    const time = new Date().toISOString().slice(11, 19);
    const lvlTag =
      level === "error"
        ? ansi.error("ERR")
        : level === "warn"
          ? ansi.warn("WRN")
          : level === "debug"
            ? ansi.dim("DBG")
            : ansi.info("INF");
    const src = source.slice(0, 14).padEnd(14);
    this.logLines.push(`${ansi.gray(time)}  ${lvlTag}  ${ansi.cyan(src)}  ${ansi.white(message)}`);
    if (this.logLines.length > this.LOG_MAX) {
      this.logLines.shift();
    }
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer !== null) {
      return;
    }
    if (this.books.length === 0) {
      return;
    }
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, 50);
  }

  private render(): void {
    if (this.renderTimer !== null) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.books.length === 0) {
      return;
    }

    const cols = Math.min(process.stdout.columns || 80, 120);
    const frame = this.buildFrame(cols);
    const lines = frame.split("\n").length - 1;

    if (this.linesRendered >= 0) {
      process.stdout.write(`\x1b[${this.linesRendered}A\x1b[J`);
    }
    process.stdout.write(frame);
    this.linesRendered = lines;
  }

  private buildFrame(cols: number): string {
    const rows: string[] = [];

    const sep = (label = "") => {
      const inner = label ? ` ${label} ` : "";
      const dashes = Math.max(0, cols - 2 - inner.length);
      return ansi.dim(`──${inner}${"─".repeat(dashes)}`);
    };

    const line = (content: string) => truncVis(content, cols);

    // ── Header ──
    const mode = this.checkOnly ? "check" : "pipeline";
    rows.push(sep(`bukcraw · ${mode}`));
    rows.push(
      line(
        `Blog ${this.blogIdx}/${this.blogTotal}: ${ansi.bold(this.blogTitle)} ${ansi.dim(`(${this.blogId})`)}`,
      ),
    );
    rows.push(
      line(
        `Lang: ${ansi.info(this.language)}  ·  Format: ${ansi.info(this.formats.join(", ") || "—")}`,
      ),
    );
    rows.push("");

    // ── Grid ──
    const total = this.books.length;
    rows.push(`Libros ${ansi.dim(`(${total})`)}`);

    const cellsPerRow = Math.max(1, Math.floor(cols / 2));
    for (let start = 0; start < total; start += cellsPerRow) {
      const chunk = this.books.slice(start, start + cellsPerRow);
      rows.push(chunk.map((b) => this.cellChar(b.state)).join(" "));
    }
    rows.push("");

    // ── Progress ──
    const completed = this.doneCount + this.skippedCount + this.errorCount;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const etaStr = this.computeEta(total - completed);
    const etaPart = etaStr ? `  ·  ETA ${ansi.dim(etaStr)}` : "";
    rows.push(
      line(
        `Progreso: ${ansi.info(`${completed}/${total}`)} (${pct}%)${etaPart}` +
          `   ${ansi.success("✓")} ${this.doneCount}  ${ansi.warn("◌")} ${this.skippedCount}  ${ansi.error("✕")} ${this.errorCount}`,
      ),
    );

    if (this.currentBookId !== null) {
      const idx = this.bookIndex.get(this.currentBookId);
      const title = idx !== undefined ? this.books[idx].title : this.currentBookId;
      const stageLabel = this.currentStage ? STAGE_LABELS[this.currentStage] : "fetching";
      rows.push(line(`▸ ${ansi.info(title)}  ${ansi.dim("→")}  ${ansi.dim(stageLabel)}`));
    } else {
      rows.push("");
    }
    rows.push("");

    // ── Logs ──
    rows.push(sep("logs"));
    if (this.logLines.length === 0) {
      rows.push(ansi.dim("  (waiting for activity...)"));
    } else {
      for (const l of this.logLines) {
        rows.push(truncVis(l, cols));
      }
    }
    rows.push(sep(`presiona ${ansi.bold("q")} ×${this.QUIT_PRESSES_REQUIRED} para salir`));
    rows.push("");

    // Pad short log sections so linesRendered stays stable between renders
    const minLogRows = this.LOG_MAX + 2; // separator + up to LOG_MAX + separator
    const logSectionRows = (this.logLines.length === 0 ? 1 : this.logLines.length) + 2;
    for (let i = logSectionRows; i < minLogRows; i++) {
      rows.splice(rows.length - 1, 0, "");
    }

    return `${rows.join("\n")}\n`;
  }

  private cellChar(state: BookState): string {
    switch (state) {
      case "pending":
        return ansi.dim("▢");
      case "in-progress":
        return ansi.cyan("▨");
      case "done":
        return ansi.success("▣");
      case "skipped":
        return ansi.warn("▥");
      case "error":
        return ansi.error("✕");
    }
  }

  private computeEta(remaining: number): string {
    if (remaining <= 0 || this.durations.length === 0) {
      return "";
    }
    const avg = this.durations.reduce((a, b) => a + b, 0) / this.durations.length;
    return formatTime(Math.ceil(avg * remaining));
  }
}

export function visibleLineCount(frame: string): number {
  return frame.split("\n").length - 1;
}

export { visibleLen };
