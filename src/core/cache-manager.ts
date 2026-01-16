/**
 * @file cache-manager.ts
 * @description Manages local file caching for scraped content to reduce network requests.
 */

import { mkdirSync } from "node:fs";
import { hashUrl, isValidUrl } from "../utils/util";

export class CacheManager {
  readonly cacheDir: string;

  constructor(cacheDir: string = "./cache") {
    this.cacheDir = cacheDir;
    mkdirSync(this.cacheDir, { recursive: true });
  }

  public async has(url: string): Promise<boolean> {
    if (!isValidUrl(url)) {
      throw new Error(`Invalid URL provided to cache: ${url}`);
    }
    const filename = `${this.cacheDir}/${hashUrl(url)}.html`;
    const file = Bun.file(filename);

    return await file.exists();
  }

  public async get(url: string, extension: string = ".html"): Promise<string | undefined> {
    if (!isValidUrl(url)) {
      throw new Error(`Invalid URL provided to cache: ${url}`);
    }
    const filename = `${this.cacheDir}/${hashUrl(url)}${extension}`;
    const file = Bun.file(filename);

    if (await file.exists()) {
      return await file.text();
    }

    return undefined;
  }

  public async save(
    url: string,
    content: string,
    force: boolean = false,
    extension: string = ".html",
  ): Promise<string> {
    if (!isValidUrl(url)) {
      throw new Error(`Invalid URL provided to cache: ${url}`);
    }
    const filename = `${this.cacheDir}/${hashUrl(url)}${extension}`;
    const file = Bun.file(filename);

    if (!force && (await file.exists())) {
      console.log(`✓ Cache hit: ${url}`);
      return filename;
    }

    console.log(`↓ Cache: ${url}`);

    await Bun.write(file, content);

    return filename;
  }
}
