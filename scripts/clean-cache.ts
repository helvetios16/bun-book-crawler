import { readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "cache");
const RETENTION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Script to clean up cache files older than a certain threshold.
 */
async function cleanCache(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    console.log("📂 No cache directory found. Nothing to clean.");
    return;
  }

  console.log(`🧹 Cleaning cache (Retention: ${RETENTION_DAYS} days)...`);

  const now = Date.now();
  const cutoff = now - RETENTION_DAYS * MS_PER_DAY;
  
  let deletedFolders = 0;
  let deletedFiles = 0;

  try {
    const entries = readdirSync(CACHE_DIR);

    for (const entry of entries) {
      const fullPath = join(CACHE_DIR, entry);
      const stats = statSync(fullPath);

      // 1. Handle date-based folders (YYYY-MM-DD)
      if (stats.isDirectory()) {
        const folderDate = new Date(entry).getTime();
        
        // If the folder name is a valid date and is older than cutoff
        if (!isNaN(folderDate) && folderDate < cutoff) {
          console.log(`  🗑️ Removing old folder: ${entry}`);
          rmSync(fullPath, { recursive: true, force: true });
          deletedFolders++;
        } else if (isNaN(folderDate)) {
            // If it's a directory but not a date (like 'misc' or others), check mtime
            if (stats.mtimeMs < cutoff) {
                console.log(`  🗑️ Removing old non-date folder: ${entry}`);
                rmSync(fullPath, { recursive: true, force: true });
                deletedFolders++;
            }
        }
      } 
      // 2. Handle individual files in the root of cache
      else if (stats.isFile()) {
        if (stats.mtimeMs < cutoff) {
          console.log(`  🗑️ Removing old file: ${entry}`);
          rmSync(fullPath, { force: true });
          deletedFiles++;
        }
      }
    }

    console.log("\n✅ Cleanup completed.");
    console.log(`📊 Summary: Removed ${deletedFolders} folders and ${deletedFiles} files.`);

  } catch (error) {
    console.error("❌ Error during cache cleanup:", error instanceof Error ? error.message : String(error));
  }
}

cleanCache();
