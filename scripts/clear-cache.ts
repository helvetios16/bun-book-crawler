import { rm } from "node:fs/promises";

async function clearCache() {
  const cacheDir = "./cache";
  try {
    await rm(cacheDir, { recursive: true, force: true });
    console.log(`✨ Cache directory '${cacheDir}' cleared successfully.`);
  } catch (error) {
    console.error(`❌ Error clearing cache:`, error);
  }
}

clearCache();
