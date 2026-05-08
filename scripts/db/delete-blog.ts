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
    const allBlogs = db.getAllBlogs();

    if (allBlogs.length === 0) {
      console.log(c.warn("No blogs in database."));
      return;
    }

    // @ts-expect-error - createdAt está en el objeto retornado por getAllBlogs
    allBlogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // --- Step 1: select blogs ---
    process.stdin.on("keypress", handleVimNavigation);

    const { selectedIds } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedIds",
        message: "Select blogs to delete:",
        choices: allBlogs.map((blog) => {
          // @ts-expect-error
          const dateStr = blog.createdAt
            ? new Date(blog.createdAt).toLocaleDateString()
            : "unknown";
          return {
            name: `${c.info(dateStr)} | ${blog.title}  ${c.gray(blog.id)}`,
            value: blog.id,
          };
        }),
        pageSize: 20,
        loop: false,
      },
    ]);

    process.stdin.removeListener("keypress", handleVimNavigation);

    if ((selectedIds as string[]).length === 0) {
      console.log(c.warn("Nothing selected. Aborted."));
      return;
    }

    // --- Step 2: preview impact ---
    const rawDb = db.getDb();
    let totalExclusive = 0;
    let totalShared = 0;

    console.log(`\n${c.warn("Impact summary:")}`);
    for (const blogId of selectedIds as string[]) {
      const blog = allBlogs.find((b) => b.id === blogId);
      if (!blog) {
        continue;
      }
      const exclusiveIds = db.blogs.getExclusiveBookIds(blogId);
      const totalBooks = (
        rawDb.prepare("SELECT COUNT(*) as n FROM blog_books WHERE blog_id = ?").get(blogId) as {
          n: number;
        }
      ).n;
      const shared = totalBooks - exclusiveIds.length;

      totalExclusive += exclusiveIds.length;
      totalShared += shared;

      console.log(`  ${c.info(blog.title)}`);
      console.log(
        `    ${c.error(`${exclusiveIds.length} books will be deleted`)} (exclusive to this blog)`,
      );
      if (shared > 0) {
        console.log(
          `    ${c.gray(`${shared} books will only lose the association`)} (appear in other blogs)`,
        );
      }
    }

    console.log(
      `\n  Total: ${c.error(`${totalExclusive} books deleted`)}${totalShared > 0 ? `, ${c.gray(`${totalShared} associations removed`)}` : ""}`,
    );

    if (!force) {
      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: `Delete ${(selectedIds as string[]).length} blog(s) and their exclusive books?`,
          default: false,
        },
      ]);

      if (!confirmed) {
        console.log(c.warn("Aborted."));
        return;
      }
    }

    for (const blogId of selectedIds as string[]) {
      db.purgeBlog(blogId);
    }

    console.log(`\n${c.success("Done.")} ${(selectedIds as string[]).length} blog(s) deleted.`);
  } finally {
    db.close();
  }
}

main();
