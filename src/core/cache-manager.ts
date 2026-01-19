/**
 * @file cache-manager.ts
 * @description Manages local file caching for scraped content to reduce network requests.
 */

import { mkdirSync } from "node:fs";
import { hashUrl, isValidUrl } from "../utils/util";

export interface CacheSaveOptions {
  url: string;
  content: string;
  force?: boolean;
  extension?: string;
}

export class CacheManager {
  readonly cacheDir: string;

  constructor(cacheDir: string = "./cache") {
    this.cacheDir = cacheDir;
    mkdirSync(this.cacheDir, { recursive: true });
  }

  public async has(url: string): Promise<boolean> {
    const filename = this.getCacheFilePath(url);
    const file = Bun.file(filename);

    return await file.exists();
  }

  public async get(url: string, extension: string = ".html"): Promise<string | undefined> {
    const filename = this.getCacheFilePath(url, extension);
    const file = Bun.file(filename);

    if (await file.exists()) {
      return await file.text();
    }

    return undefined;
  }

  public async save({
    url,
    content,
    force = false,
    extension = ".html",
  }: CacheSaveOptions): Promise<string> {
    const filename = this.getCacheFilePath(url, extension);
    const file = Bun.file(filename);

    if (!force && (await file.exists())) {
      console.log(`✓ Cache hit: ${url}${extension}`);
      return filename;
    }

    console.log(`↓ Cache: ${url}${extension}`);

    await Bun.write(file, content);

    return filename;
  }

  private getDayDir(): string {
    const date = new Date().toISOString().split("T")[0];
    return `${this.cacheDir}/${date}`;
  }

  private getContentType(url: string): string {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("/book/")) {
      return "books";
    }
    if (lowerUrl.includes("/author/")) {
      return "authors";
    }
    if (lowerUrl.includes("/blog/")) {
      return "blog";
    }
    return "misc";
  }

  private getCacheFilePath(url: string, extension: string = ".html"): string {
    if (!isValidUrl(url)) {
      throw new Error(`Invalid URL provided to cache: ${url}`);
    }

    const type = this.getContentType(url);
    const dir = `${this.getDayDir()}/${type}`;

    mkdirSync(dir, { recursive: true });

    return `${dir}/${hashUrl(url)}${extension}`;
  }
}
