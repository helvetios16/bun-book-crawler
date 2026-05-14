import inquirer from "inquirer";
import { DatabaseService } from "../../src/core/database";
import type { Book, Edition } from "../../src/types";
import { ansi } from "../../src/utils/logger";

const c = ansi;

type Algorithm = "greedy" | "exact";
type FromEntry = { prevMask: number; bookIdx: number } | null;

interface SetCoverArgs {
  language: string;
  formats: string[];
  output: string;
  blogs: string[];
  sort: string;
  algorithm: Algorithm;
}

interface EligibleBook {
  book: Book;
  pageCount: number;
  pageSource: "book" | "edition-fallback";
  coversBlogs: Set<string>;
  editions: Edition[];
}

interface EditionSlim {
  title: string;
  link: string;
  language?: string;
  format?: string;
  pages?: number;
  averageRating?: number;
  coverImage?: string;
}

interface SelectedBook {
  id: string;
  title: string;
  author: string;
  pageCount: number;
  pageSource: "book" | "edition-fallback";
  coversBlogs: string[];
  coverImage?: string;
  averageRating?: number;
  editions: EditionSlim[];
}

interface ExcludedBook {
  id: string;
  title: string;
  author: string;
  reason: "no-suitable-edition" | "no-page-data";
  blogs: string[];
}

interface SetCoverOutput {
  generatedAt: string;
  algorithm: Algorithm;
  params: { language: string; formats: string[]; blogs: string[] };
  blogs: { id: string; title: string; url: string; coveredBy: string[] }[];
  selected: SelectedBook[];
  totals: {
    blogsCovered: number;
    blogsTotal: number;
    blogsUncovered: string[];
    selectedBooks: number;
    totalPages: number;
  };
  excluded: ExcludedBook[];
}

function parseArgs(): SetCoverArgs {
  const args = process.argv.slice(2);
  const params: SetCoverArgs = {
    language: "spa",
    formats: ["ebook", "Kindle Edition"],
    output: "set-cover.json",
    blogs: [],
    sort: "date",
    algorithm: "greedy",
  };

  for (const arg of args) {
    if (arg.startsWith("--language=")) {
      params.language = arg.split("=")[1] ?? "spa";
    } else if (arg.startsWith("--format=")) {
      const val = arg.split("=")[1] ?? "";
      params.formats = val ? val.split(",").filter(Boolean) : [];
    } else if (arg.startsWith("--output=")) {
      params.output = arg.split("=")[1] ?? "set-cover.json";
    } else if (arg.startsWith("--blogs=")) {
      const val = arg.split("=")[1];
      params.blogs = val ? val.split(",").filter(Boolean) : [];
    } else if (arg.startsWith("--sort=")) {
      params.sort = arg.split("=")[1] ?? "date";
    } else if (arg.startsWith("--algorithm=")) {
      const val = arg.split("=")[1];
      if (val === "exact" || val === "greedy") {
        params.algorithm = val;
      }
    }
  }

  return params;
}

function getEligibility(
  book: Book,
  _language: string,
  formats: string[],
  dbService: DatabaseService,
):
  | { ok: true; pages: number; source: "book" | "edition-fallback"; editions: Edition[] }
  | { ok: false; reason: "no-suitable-edition" | "no-page-data" } {
  if (!book.legacyId) {
    return { ok: false, reason: "no-suitable-edition" };
  }

  // Language stored as display name (e.g. "Spanish"), not the URL code ("spa").
  // Editions were already scraped with the correct language filter, so we skip it here.
  const editions = dbService.getEditions(book.legacyId);
  const matching =
    formats.length === 0
      ? editions
      : editions.filter(
          (e) => e.format && formats.some((f) => f.toLowerCase() === e.format?.toLowerCase()),
        );

  if (matching.length === 0) {
    return { ok: false, reason: "no-suitable-edition" };
  }

  if (book.pageCount && book.pageCount > 0) {
    return { ok: true, pages: book.pageCount, source: "book", editions: matching };
  }

  const validPages = matching.map((e) => e.pages).filter((p): p is number => !!p && p > 0);
  if (validPages.length === 0) {
    return { ok: false, reason: "no-page-data" };
  }
  return {
    ok: true,
    pages: Math.min(...validPages),
    source: "edition-fallback",
    editions: matching,
  };
}

function makeSelectedBook(b: EligibleBook): SelectedBook {
  return {
    id: b.book.id,
    title: b.book.title,
    author: b.book.author || "",
    pageCount: b.pageCount,
    pageSource: b.pageSource,
    coversBlogs: Array.from(b.coversBlogs),
    coverImage: b.book.coverImage,
    averageRating: b.book.averageRating,
    editions: b.editions.map((e) => ({
      title: e.title,
      link: e.link,
      language: e.language,
      format: e.format,
      pages: e.pages,
      averageRating: e.averageRating,
      coverImage: e.coverImage,
    })),
  };
}

function runGreedyAlgorithm(
  eligible: EligibleBook[],
  targetBlogIds: string[],
): { selected: SelectedBook[]; blogsUncovered: Set<string> } {
  const blogsUncovered = new Set(targetBlogIds);
  const selected: SelectedBook[] = [];
  const candidates = eligible.slice();

  while (blogsUncovered.size > 0 && candidates.length > 0) {
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const newCoverage = [...candidate.coversBlogs].filter((b) => blogsUncovered.has(b)).length;
      if (newCoverage === 0) {
        continue;
      }

      const score = newCoverage / candidate.pageCount;
      const isBetter =
        score > bestScore ||
        (score === bestScore &&
          candidate.pageCount < (candidates[bestIdx]?.pageCount ?? Number.POSITIVE_INFINITY));

      if (isBetter) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      break;
    }

    const best = candidates.splice(bestIdx, 1)[0];
    for (const blogId of best.coversBlogs) {
      blogsUncovered.delete(blogId);
    }
    selected.push(makeSelectedBook(best));
  }

  return { selected, blogsUncovered };
}

// Exact weighted set cover via bitmask DP. O(2^M * N) — viable for M ≤ MAX_BLOGS_EXACT.
const MAX_BLOGS_EXACT = 20;

function runExactAlgorithm(
  eligible: EligibleBook[],
  targetBlogIds: string[],
): { selected: SelectedBook[]; blogsUncovered: Set<string>; actualAlgorithm: Algorithm } {
  const M = targetBlogIds.length;

  if (M > MAX_BLOGS_EXACT) {
    console.log(
      c.warn(
        `  Exact algorithm requires ≤${MAX_BLOGS_EXACT} blogs. Got ${M}. Falling back to greedy.`,
      ),
    );
    const result = runGreedyAlgorithm(eligible, targetBlogIds);
    return { ...result, actualAlgorithm: "greedy" };
  }

  const blogIndex = new Map(targetBlogIds.map((id, i): [string, number] => [id, i]));

  const candidates = eligible
    .map((b) => ({
      ...b,
      coverMask: [...b.coversBlogs]
        .filter((id) => blogIndex.has(id))
        .reduce((acc, id) => acc | (1 << (blogIndex.get(id) ?? 0)), 0),
    }))
    .filter((b) => b.coverMask > 0);

  const coverableMask = candidates.reduce((acc, b) => acc | b.coverMask, 0);
  const fullMask = (1 << M) - 1;
  const uncoverableMask = fullMask & ~coverableMask;
  const blogsUncovered = new Set(targetBlogIds.filter((_, i) => (uncoverableMask >> i) & 1));

  if (coverableMask === 0) {
    return { selected: [], blogsUncovered, actualAlgorithm: "exact" };
  }

  const numStates = 1 << M;
  const dp = new Float64Array(numStates).fill(Number.POSITIVE_INFINITY);
  dp[0] = 0;
  const from: FromEntry[] = new Array(numStates).fill(null);

  for (let i = 0; i < candidates.length; i++) {
    const book = candidates[i];
    for (let mask = 0; mask < numStates; mask++) {
      if (dp[mask] === Number.POSITIVE_INFINITY) {
        continue;
      }
      const newMask = mask | book.coverMask;
      if (newMask === mask) {
        continue;
      }
      const newCost = dp[mask] + book.pageCount;
      if (newCost < dp[newMask]) {
        dp[newMask] = newCost;
        from[newMask] = { prevMask: mask, bookIdx: i };
      }
    }
  }

  const selected: SelectedBook[] = [];
  let mask = coverableMask;
  let entry = from[mask];
  while (mask !== 0 && entry !== null) {
    selected.push(makeSelectedBook(candidates[entry.bookIdx]));
    mask = entry.prevMask;
    entry = from[mask];
  }

  return { selected, blogsUncovered, actualAlgorithm: "exact" };
}

async function main(): Promise<void> {
  const args = parseArgs();
  let { language, formats, output, blogs: targetBlogs, sort, algorithm } = args;

  const dbService = new DatabaseService();

  try {
    if (targetBlogs.length === 0) {
      const allBlogs = dbService.getAllBlogs();

      if (allBlogs.length === 0) {
        console.error(c.error("No blogs found in database."));
        return;
      }

      if (sort === "date") {
        // @ts-expect-error - createdAt está en el objeto retornado por getAllBlogs
        allBlogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (sort === "name") {
        allBlogs.sort((a, b) => a.title.localeCompare(b.title));
      } else if (sort === "id") {
        allBlogs.sort((a, b) => a.id.localeCompare(b.id));
      }

      const handleVimNavigation = (_ch: string, key: { name?: string }) => {
        if (key?.name === "j") {
          process.stdin.emit("keypress", null, { name: "down" });
        } else if (key?.name === "k") {
          process.stdin.emit("keypress", null, { name: "up" });
        } else if (key?.name === "q") {
          console.log(c.warn("\nAborted by user (q)."));
          process.exit(0);
        }
      };
      process.stdin.on("keypress", handleVimNavigation);

      const answer = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selectedBlogs",
          message: "Select blogs for set cover analysis:",
          choices: allBlogs.map((blog) => {
            // @ts-expect-error
            const dateStr = blog.createdAt
              ? new Date(blog.createdAt).toLocaleDateString()
              : "unknown";
            return {
              name: `${c.info(dateStr)} | ${blog.title} (${c.gray(blog.id)})`,
              value: blog.id,
              checked: true,
            };
          }),
          pageSize: 20,
          loop: false,
        },
      ]);

      process.stdin.removeListener("keypress", handleVimNavigation);
      targetBlogs = answer.selectedBlogs;

      if (targetBlogs.length === 0) {
        console.log(c.warn("No blogs selected. Aborting."));
        return;
      }
    }

    console.log(
      `\n${c.heading("Set Cover")} ${c.gray(`| lang=${language} formats=${formats.join(",")} blogs=${targetBlogs.length} algorithm=${algorithm}`)}`,
    );

    // --- 1. Fetch blog-book relations ---
    console.log(`\n${c.heading("--- 1. Fetching relations ---")}`);

    const db = dbService.getDb();
    let querySql = `
      SELECT bb.book_id, b.id as blog_id, b.title as blog_title, b.url as blog_url
      FROM blog_books bb
      JOIN blogs b ON bb.blog_id = b.id
    `;
    const queryParams: string[] = [];
    if (targetBlogs.length > 0) {
      const placeholders = targetBlogs.map(() => "?").join(",");
      querySql += ` WHERE b.id IN (${placeholders})`;
      queryParams.push(...targetBlogs);
    }

    const allBlogRelations = db.prepare(querySql).all(...queryParams) as {
      book_id: string;
      blog_id: string;
      blog_title: string;
      blog_url: string;
    }[];

    const blogInfoById = new Map<string, { id: string; title: string; url: string }>();
    const blogsByNormalizedBookId = new Map<string, Set<string>>();

    for (const rel of allBlogRelations) {
      blogInfoById.set(rel.blog_id, { id: rel.blog_id, title: rel.blog_title, url: rel.blog_url });
      const normalizedBookId = rel.book_id.match(/^\d+/)?.[0] || rel.book_id;
      if (!blogsByNormalizedBookId.has(normalizedBookId)) {
        blogsByNormalizedBookId.set(normalizedBookId, new Set());
      }
      blogsByNormalizedBookId.get(normalizedBookId)?.add(rel.blog_id);
    }

    // --- 2. Process books and check eligibility ---
    console.log(`\n${c.heading("--- 2. Checking book eligibility ---")}`);

    const allBooks = dbService.getAllBooks();
    const booksInScope = allBooks.filter((b) => {
      const normalizedId = b.id.match(/^\d+/)?.[0] || b.id;
      return blogsByNormalizedBookId.has(normalizedId);
    });

    const booksByCanonicalKey = new Map<string, Book>();
    for (const book of booksInScope) {
      const canonicalTitle = book.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "");
      const canonicalAuthor = (book.author || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "");
      const key = `${canonicalTitle}-${canonicalAuthor}`;
      if (!booksByCanonicalKey.has(key)) {
        booksByCanonicalKey.set(key, book);
      }
    }

    const eligible: EligibleBook[] = [];
    const excluded: ExcludedBook[] = [];

    for (const book of booksByCanonicalKey.values()) {
      const normalizedId = book.id.match(/^\d+/)?.[0] || book.id;
      const blogsForBook = blogsByNormalizedBookId.get(normalizedId) ?? new Set<string>();

      const result = getEligibility(book, language, formats, dbService);
      if (result.ok) {
        eligible.push({
          book,
          pageCount: result.pages,
          pageSource: result.source,
          coversBlogs: blogsForBook,
          editions: result.editions,
        });
      } else {
        excluded.push({
          id: book.id,
          title: book.title,
          author: book.author || "",
          reason: result.reason,
          blogs: Array.from(blogsForBook),
        });
      }
    }

    console.log(c.success(`  ${eligible.length} eligible, ${excluded.length} excluded`));

    // --- 3. Run chosen algorithm ---
    console.log(`\n${c.heading(`--- 3. Running ${algorithm} set cover ---`)}`);

    let selected: SelectedBook[];
    let blogsUncovered: Set<string>;
    let usedAlgorithm = algorithm;

    if (algorithm === "exact") {
      const result = runExactAlgorithm(eligible, targetBlogs);
      selected = result.selected;
      blogsUncovered = result.blogsUncovered;
      usedAlgorithm = result.actualAlgorithm;
    } else {
      const result = runGreedyAlgorithm(eligible, targetBlogs);
      selected = result.selected;
      blogsUncovered = result.blogsUncovered;
    }

    // --- 4. Build and save output ---
    console.log(`\n${c.heading("--- 4. Saving ---")}`);

    const blogsOutput = Array.from(blogInfoById.values()).map((blog) => ({
      ...blog,
      coveredBy: selected.filter((s) => s.coversBlogs.includes(blog.id)).map((s) => s.id),
    }));

    excluded.sort((a, b) => b.blogs.length - a.blogs.length);

    const totalPages = selected.reduce((sum, s) => sum + s.pageCount, 0);
    const blogsUncoveredArr = Array.from(blogsUncovered);

    const finalOutput: SetCoverOutput = {
      generatedAt: new Date().toISOString(),
      algorithm: usedAlgorithm,
      params: { language, formats, blogs: targetBlogs },
      blogs: blogsOutput,
      selected,
      totals: {
        blogsCovered: targetBlogs.length - blogsUncoveredArr.length,
        blogsTotal: targetBlogs.length,
        blogsUncovered: blogsUncoveredArr,
        selectedBooks: selected.length,
        totalPages,
      },
      excluded,
    };

    const { mkdirSync } = await import("node:fs");
    const path = await import("node:path");

    const reportsDir = path.resolve(process.cwd(), ".reports");
    mkdirSync(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const finalOutputName = output === "set-cover.json" ? `set-cover-${timestamp}.json` : output;
    const finalPath = path.resolve(reportsDir, finalOutputName);

    await Bun.write(finalPath, JSON.stringify(finalOutput, null, 2));

    console.log(
      `${c.success("Done.")} ${selected.length} books · ${totalPages} pages · ${finalOutput.totals.blogsCovered}/${finalOutput.totals.blogsTotal} blogs covered. ${c.gray(finalPath)}`,
    );
    if (blogsUncoveredArr.length > 0) {
      const uncoveredTitles = blogsUncoveredArr
        .map((id) => blogInfoById.get(id)?.title ?? id)
        .join(", ");
      console.log(c.warn(`  Uncovered: ${uncoveredTitles}`));
    }
  } catch (error: unknown) {
    const fatalMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n${c.error("Fatal error:")} ${fatalMessage}`);
  } finally {
    dbService.close();
  }
}

main();
