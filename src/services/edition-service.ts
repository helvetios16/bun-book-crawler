import { CACHE_TTL_DAYS, GOODREADS_URL, WORK_URL } from "../config/constants";
import { type BookFilterOptions, type Edition, isEditionsFilters } from "../types";
import { pMap } from "../utils/concurrency";
import { Logger } from "../utils/logger";
import { getErrorMessage } from "../utils/util";
import { BaseScraperService } from "./base-scraper";
import {
  type EditionsFilters,
  extractPaginationInfo,
  parseEditionsHtml,
  parseEditionsList,
} from "./editions-parser";

const log = new Logger("EditionService");

interface SaveEditionsParams {
  baseUrl: string;
  legacyId: string | number;
  editions: Edition[];
  urls: string[];
  totalPages: number;
  options: BookFilterOptions;
}

export class EditionService extends BaseScraperService {
  /**
   * Scrapes edition filters for a given work (legacy ID).
   */
  public async scrapeEditionsFilters(legacyId: string | number): Promise<EditionsFilters | null> {
    const url = `${GOODREADS_URL}${WORK_URL}${legacyId}`;
    log.info(`Scraping edition filters (Work ID: ${legacyId})...`);

    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        return JSON.parse(cachedParsed);
      }
    } catch (error: unknown) {
      log.debug("Edition filters cache miss:", getErrorMessage(error));
    }

    const validate = (html: string) => {
      return html.includes('name="filter_by_language"') || html.includes('name="sort"');
    };

    const { content } = await this.fetchContentWithFallback(url, validate);
    await this.cache.save({ url, content, force: false, extension: ".html" });

    const editionsData = parseEditionsHtml(content);
    if (editionsData) {
      await this.cache.save({
        url,
        content: JSON.stringify(editionsData, null, 2),
        force: true,
        extension: "-parsed.json",
      });
      log.info(`Edition filters saved (${editionsData.language.length} languages found).`);
      return editionsData;
    } else {
      log.warn("Failed to parse edition filters.");
      return null;
    }
  }

  /**
   * Scrapes editions based on provided filters.
   */
  public async scrapeFilteredEditions(
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<Edition[]> {
    const baseUrl = `${GOODREADS_URL}${WORK_URL}${legacyId}`;

    // 0. Check DB Cache
    const dbEditions = this.getEditionsFromDbCache(legacyId, options.language);
    if (dbEditions) {
      return dbEditions;
    }

    // 1. Validate filters
    await this.validateFilters(baseUrl, legacyId, options);

    // 2. Build URL
    const baseUrlWithParams = this.buildEditionsUrl(baseUrl, options);

    // 3. Process pagination
    const { allEditions, scrapedUrls, totalPages } =
      await this.processEditionsPagination(baseUrlWithParams);

    // 4. Save results
    await this.saveEditionsResults({
      baseUrl: baseUrlWithParams,
      legacyId,
      editions: allEditions,
      urls: scrapedUrls,
      totalPages,
      options,
    });

    return allEditions;
  }

  private getEditionsFromDbCache(legacyId: string | number, language?: string): Edition[] | null {
    const dbEditions = this.db.getEditions(legacyId, language);
    const firstEdition = dbEditions?.[0];
    if (dbEditions && dbEditions.length > 0 && firstEdition) {
      if (this.isCacheValid(firstEdition.createdAt)) {
        log.debug(`DB cache hit: ${dbEditions.length} editions found.`);
        return dbEditions;
      }
    }
    return null;
  }

  private async validateFilters(
    baseUrl: string,
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<void> {
    const cachedMetadata = await this.cache.get(baseUrl, "-parsed.json");
    if (!cachedMetadata) {
      throw new Error(
        `No edition metadata found for ID ${legacyId}. Run 'scrapeEditionsFilters' first.`,
      );
    }

    const parsedOptions: unknown = JSON.parse(cachedMetadata);
    if (!isEditionsFilters(parsedOptions)) {
      throw new Error(`Cached edition metadata for ID ${legacyId} is corrupted.`);
    }
    const validOptions = parsedOptions as EditionsFilters;
    const { sort, format, language } = options;

    if (sort && !validOptions.sort.some((s) => s.value === sort)) {
      throw new Error(`Invalid sort option: '${sort}'.`);
    }
    if (format && !validOptions.format.some((f) => f.value === format)) {
      throw new Error(`Invalid format: '${format}'.`);
    }
    if (language && !validOptions.language.some((l) => l.value === language)) {
      throw new Error(`Invalid language: '${language}'.`);
    }
  }

  private buildEditionsUrl(baseUrl: string, options: BookFilterOptions): string {
    const query = new URLSearchParams();
    query.append("utf8", "✓");
    if (options.sort) {
      query.append("sort", options.sort);
    }
    if (options.format) {
      query.append("filter_by_format", options.format);
    }
    if (options.language) {
      query.append("filter_by_language", options.language);
    }
    return `${baseUrl}?${query.toString()}`;
  }

  private async processEditionsPagination(baseUrlWithParams: string) {
    const scrapedUrls: string[] = [];
    const allEditions: Edition[] = [];

    const { content: page1Content } = await this.getPageContent(baseUrlWithParams);
    scrapedUrls.push(baseUrlWithParams);
    allEditions.push(...parseEditionsList(page1Content));

    const pagination = extractPaginationInfo(page1Content);
    log.info(`Pagination: ${pagination.totalPages} total pages.`);

    if (pagination.totalPages > 1) {
      const pageUrls = Array.from(
        { length: pagination.totalPages - 1 },
        (_, i) => `${baseUrlWithParams}&page=${i + 2}`,
      );
      const results = await pMap(
        pageUrls,
        async (pageUrl) => {
          const { content } = await this.getPageContent(pageUrl);
          return { pageUrl, editions: parseEditionsList(content) };
        },
        this.concurrency,
      );

      for (const result of results) {
        scrapedUrls.push(result.pageUrl);
        allEditions.push(...result.editions);
      }
    }
    return { allEditions, scrapedUrls, totalPages: pagination.totalPages };
  }

  private async getPageContent(url: string): Promise<{ content: string; fromCache: boolean }> {
    const validate = (html: string) => {
      return html.includes("elementList") || html.includes('class="bookTitle"');
    };

    return this.cache.getOrFetch(
      url,
      async () => {
        const { content } = await this.fetchContentWithFallback(url, validate);
        return content;
      },
      ".html",
    );
  }

  private async saveEditionsResults(params: SaveEditionsParams): Promise<void> {
    const { baseUrl, legacyId, editions, urls, totalPages, options } = params;
    await this.cache.save({
      url: baseUrl,
      content: JSON.stringify(editions, null, 2),
      force: true,
      extension: "-editions.json",
    });

    if (editions.length > 0) {
      this.db.deleteEditions(legacyId, options.language);
      this.db.saveEditions(legacyId, editions);
    }

    const metadata = {
      timestamp: new Date().toISOString(),
      legacyId,
      filters: options,
      stats: { totalPages, scrapedUrls: urls, totalEditions: editions.length },
    };
    await this.cache.save({
      url: baseUrl,
      content: JSON.stringify(metadata, null, 2),
      force: true,
      extension: "-filter-meta.json",
    });
    log.info(`Done. ${editions.length} editions saved.`);
  }

  private isCacheValid(dateStr?: string): boolean {
    if (!dateStr) {
      return false;
    }
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= CACHE_TTL_DAYS;
  }
}
