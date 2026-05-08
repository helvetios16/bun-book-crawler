import inquirer from "inquirer";
import { DatabaseService } from "../../src/core/database";
import { ansi } from "../../src/utils/logger";

const c = ansi;
const force = process.argv.includes("--force");

async function main(): Promise<void> {
  const db = new DatabaseService();

  try {
    const rawDb = db.getDb();
    const bookCount = (rawDb.prepare("SELECT COUNT(*) as n FROM books").get() as { n: number }).n;
    const blogCount = (rawDb.prepare("SELECT COUNT(*) as n FROM blogs").get() as { n: number }).n;
    const editionCount = (
      rawDb.prepare("SELECT COUNT(*) as n FROM editions").get() as { n: number }
    ).n;

    console.log(`\n${c.warn("⚠  Database reset — this will delete ALL data:")}`);
    console.log(`   ${c.info(String(bookCount))} books`);
    console.log(`   ${c.info(String(blogCount))} blogs`);
    console.log(`   ${c.info(String(editionCount))} editions`);

    if (!force) {
      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: "Continue?",
          default: false,
        },
      ]);

      if (!confirmed) {
        console.log(c.warn("Aborted."));
        return;
      }
    }

    db.reset();
    console.log(`\n${c.success("Done.")} Database cleared.`);
  } finally {
    db.close();
  }
}

main();
