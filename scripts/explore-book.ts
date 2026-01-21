import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const CACHE_DIR = join(process.cwd(), "cache");

// Find the most recent JSON file in the cache
const findLatestBookJson = async () => {
  // Search in new structure (books folder) and fallback to root
  const glob = new Glob("**/*.json");
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: CACHE_DIR })) {
    // Prefer files in 'books' directory or root, ignore others if specific logic needed later
    files.push(join(CACHE_DIR, file));
  }

  if (files.length === 0) {
    return null;
  }

  // Sort by modification time, newest first
  return files.sort((a, b) => {
    return statSync(b).mtime.getTime() - statSync(a).mtime.getTime();
  })[0];
};

const cachePath = await findLatestBookJson();

if (!cachePath) {
  console.error("❌ No JSON files found in cache.");
  process.exit(1);
}

console.log(`📂 Reading: ${cachePath}`);

const rawData = readFileSync(cachePath, "utf-8");
const json = JSON.parse(rawData);
const state = json.props.pageProps.apolloState;

// Helper to resolve references directly from the state map
const resolve = (ref: string | undefined | null) => {
  if (!ref) {
    return null;
  }
  return state[ref] || null;
};

// Find the main book entry using Regex for flexibility (starts with Book: and has titles)
const bookKey = Object.keys(state).find(
  (key) => /^Book:/.test(key) && state[key].title && state[key].titleComplete,
);

const data = state[bookKey || ""];

if (!data) {
  console.error("❌ No valid Book entry found with title data.");
  process.exit(1);
}

// Resolve relationships directly using __ref
const authorRef = data.primaryContributorEdge?.node?.__ref;
const authorData = resolve(authorRef);

const workRef = data.work?.__ref;
const workData = resolve(workRef);

const book = {
  id: data.legacyId,
  legacyId: workData?.legacyId,
  webUrl: data?.webUrl,
  title: data.title,
  titleComplete: data.titleComplete,
  author: authorData?.name,
  description: data.description?.replace(/<br\s*\/?>/gi, "\n"),
  pages: data.details?.numPages,
  language: data.details?.language?.name,
  format: data.details?.format,
};

console.log(book);
