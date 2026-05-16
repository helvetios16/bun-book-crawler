#!/usr/bin/env bun
import { BrowserClient } from "../../src/core/browser-client";
import { DatabaseService } from "../../src/core/database";
import { GoodreadsService } from "../../src/services/goodreads-service";
import { type PipelineError, PipelineService } from "../../src/services/pipeline-service";
import { GridReporter } from "../../src/utils/grid-reporter";
import { ansi } from "../../src/utils/logger";
import { PlainReporter } from "../../src/utils/plain-reporter";
import type { PipelineReporter } from "../../src/utils/reporter";

const c = ansi;

// ── Types ──

interface PipelineArgs {
  blogIds: string[];
  language: string;
  formats: string[];
  sort: string;
  output: string;
  enableReport: boolean;
  checkOnly: boolean;
  force: boolean;
  plain: boolean;
}

// ── Args parsing ──

function parseArgs(): PipelineArgs | null {
  const args: string[] = process.argv.slice(2);
  const params: PipelineArgs = {
    blogIds: [],
    language: "spa",
    formats: ["ebook", "Kindle Edition"],
    sort: "num_ratings",
    output: "",
    enableReport: false,
    checkOnly: false,
    force: false,
    plain: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return null;
    } else if (arg === "--report") {
      params.enableReport = true;
    } else if (arg === "--check-only") {
      params.checkOnly = true;
    } else if (arg === "--force") {
      params.force = true;
    } else if (arg === "--plain") {
      params.plain = true;
    } else if (arg.startsWith("--blogs=")) {
      const value = arg.split("=").slice(1).join("=");
      params.blogIds = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--language=")) {
      params.language = arg.split("=")[1] ?? "spa";
    } else if (arg.startsWith("--format=")) {
      const formatValue = arg.split("=")[1] ?? "";
      params.formats = formatValue
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--sort=")) {
      params.sort = arg.split("=")[1] ?? "num_ratings";
    } else if (arg.startsWith("--output=")) {
      params.output = arg.split("=").slice(1).join("=");
    } else if (!arg.startsWith("--")) {
      params.blogIds.push(arg);
    }
  }

  return params;
}

function printHelp(): void {
  console.log(`
${c.heading("Pipeline: Blog → Books → Editions → Report")}

Scrapes multiple blogs, extracts books and editions, and generates
a combined report showing which books appear across multiple blogs.

${c.heading("Usage:")}
  bukcraw run [options] [blogId1 blogId2 ...]
  bukcraw check [options] [blogId1 blogId2 ...]

${c.heading("Options:")}
  --blogs=<id1,id2,...>  Blog IDs, comma-separated
  --language=<code>      Language code (default: ${c.info("spa")})
  --format=<fmt>         Book format(s), comma-separated
                         (default: ${c.info("ebook,Kindle Edition")})
  --sort=<order>         Edition sort order (default: ${c.info("num_ratings")})
  --report               Generate final report
  --force                Force full scrape (ignore format checks)
  --plain                Disable grid UI, use plain log output
  --output=<path>        Output filename (default: auto-generated)
  --help, -h             Show this help
`);
}

// ── Main ──

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args) {
    return;
  }

  const { blogIds, language, formats, sort, output, enableReport, checkOnly, force, plain } = args;

  if (blogIds.length === 0) {
    console.error(c.error("Error: At least one blog ID is required."));
    process.exit(1);
  }

  const useGrid = !plain && process.stdout.isTTY && process.env.CI !== "true";
  const reporter: PipelineReporter = useGrid ? new GridReporter() : new PlainReporter();

  reporter.onPipelineStart(blogIds, { language, formats, checkOnly });

  const browserClient = new BrowserClient();
  const dbService = new DatabaseService();
  const allErrors: PipelineError[] = [];

  try {
    const goodreadsService = new GoodreadsService(browserClient);
    const pipelineService = new PipelineService(
      goodreadsService.blog,
      goodreadsService.book,
      goodreadsService.edition,
      dbService,
      reporter,
    );

    for (const [i, blogId] of blogIds.entries()) {
      reporter.onBlogStart(i, blogIds.length, blogId);
      const { errors } = await pipelineService.processBlog(blogId, {
        language,
        formats,
        sort,
        checkOnly,
        force,
      });
      for (const err of errors) {
        allErrors.push({ blogId, ...err });
      }
    }

    reporter.onPipelineEnd({ errors: allErrors });

    if (checkOnly) {
      console.log(`\n${c.success("Check completed.")}`);
      return;
    }

    goodreadsService.printTelemetry();

    if (!enableReport) {
      console.log(`\n${c.gray("Final report generation is disabled (use --report to enable)")}`);
    } else {
      console.log(`\n${c.heading("=== Phase 2: Generating combined report ===")}`);
      const report = pipelineService.generateReport(blogIds, language);

      const { mkdirSync } = await import("node:fs");
      const path = await import("node:path");
      const reportsDir = path.resolve(process.cwd(), ".reports");
      mkdirSync(reportsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const finalPath = path.resolve(reportsDir, output || `report-pipeline-${timestamp}.json`);
      await Bun.write(finalPath, JSON.stringify(report, null, 2));

      console.log(`\n${c.heading("=== Results ===")}`);
      console.log(`  Unique books:          ${c.info(String(report.count))}`);
      console.log(`  Report:                ${c.gray(finalPath)}`);
    }

    if (allErrors.length > 0) {
      console.log(`\n${c.warn(`${allErrors.length} error(s) found during process:`)}`);
      for (const err of allErrors) {
        console.log(
          `  - ${c.error(err.blogId || "General")}: ${c.info(err.title)} (${c.gray(err.id)}) -> ${c.gray(err.error)}`,
        );
      }
    }
  } catch (error: unknown) {
    reporter.onPipelineEnd({ errors: allErrors });
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n${c.error("Fatal error:")} ${message}`);
  } finally {
    dbService.close();
    await browserClient.close();
  }
}

main();
