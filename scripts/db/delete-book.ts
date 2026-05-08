import inquirer from "inquirer";
import { DatabaseService } from "../../src/core/database";
import { ansi } from "../../src/utils/logger";

const c = ansi;
const force = process.argv.includes("--force");

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

async function main(): Promise<void> {
  const db = new DatabaseService();

  try {
    const allBooks = db.getAllBooks();

    if (allBooks.length === 0) {
      console.log(c.warn("No books in database."));
      return;
    }

    // --- Step 1: search term ---
    const { term } = await inquirer.prompt([
      {
        type: "input",
        name: "term",
        message: "Search books (title or author, leave empty to show all):",
      },
    ]);

    const q = (term as string).toLowerCase().trim();
    const filtered = q
      ? allBooks.filter(
          (b) => b.title.toLowerCase().includes(q) || (b.author || "").toLowerCase().includes(q),
        )
      : allBooks;

    if (filtered.length === 0) {
      console.log(c.warn(`No books matched "${term}".`));
      return;
    }

    // --- Step 2: select from results ---
    process.stdin.on("keypress", handleVimNavigation);
    const { selectedIds } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedIds",
        message: "Select books to delete:",
        choices: filtered.map((b) => ({
          name: `${b.title}${b.author ? ` — ${b.author}` : ""}  ${c.gray(b.id)}`,
          value: b.id,
        })),
        pageSize: 20,
        loop: false,
      },
    ]);

    process.stdin.removeListener("keypress", handleVimNavigation);

    if ((selectedIds as string[]).length === 0) {
      console.log(c.warn("Nothing selected. Aborted."));
      return;
    }

    // --- Step 3: preview impact ---
    const rawDb = db.getDb();
    console.log(`\n${c.warn("The following will be deleted:")}`);
    for (const id of selectedIds as string[]) {
      const book = allBooks.find((b) => b.id === id);
      if (!book) {
        continue;
      }
      const edCount = book.legacyId
        ? (
            rawDb
              .prepare("SELECT COUNT(*) as n FROM editions WHERE book_legacy_id = ?")
              .get(String(book.legacyId)) as { n: number }
          ).n
        : 0;
      const relCount = (
        rawDb.prepare("SELECT COUNT(*) as n FROM blog_books WHERE book_id = ?").get(id) as {
          n: number;
        }
      ).n;
      console.log(
        `  ${c.info(book.title)}  ${c.gray(`${edCount} editions · ${relCount} blog refs`)}`,
      );
    }

    if (!force) {
      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: `Delete ${(selectedIds as string[]).length} book(s)?`,
          default: false,
        },
      ]);

      if (!confirmed) {
        console.log(c.warn("Aborted."));
        return;
      }
    }

    for (const id of selectedIds as string[]) {
      db.purgeBook(id);
    }

    console.log(`\n${c.success("Done.")} ${(selectedIds as string[]).length} book(s) deleted.`);
  } finally {
    db.close();
  }
}

main();
