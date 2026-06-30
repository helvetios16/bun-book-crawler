/**
 * @file logger.ts
 * @description Structured logger with levels, timestamps, and ANSI color support.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[91m",
  yellow: "\x1b[93m",
  cyan: "\x1b[96m",
  green: "\x1b[92m",
  magenta: "\x1b[95m",
  gray: "\x1b[37m",
  white: "\x1b[97m",
} as const;

const LEVEL_STYLES: Record<LogLevel, { color: string; label: string }> = {
  debug: { color: ANSI.gray, label: "DBG" },
  info: { color: ANSI.cyan, label: "INF" },
  warn: { color: ANSI.yellow, label: "WRN" },
  error: { color: ANSI.red, label: "ERR" },
};

export class Logger {
  private readonly minLevel: number;
  private readonly prefix: string;

  constructor(prefix = "", level?: LogLevel) {
    this.prefix = prefix;
    const envLevel = (process.env.LOG_LEVEL as LogLevel) || level || "info";
    this.minLevel = LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
  }

  debug(message: string, ...args: unknown[]): void {
    this.log("debug", message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log("info", message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log("warn", message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log("error", message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    if (_loggerSink) {
      const argsStr = args.length > 0 ? ` ${args.map((a) => String(a)).join(" ")}` : "";
      _loggerSink(level, this.prefix, message + argsStr);
      return;
    }

    const style = LEVEL_STYLES[level];
    const time = new Date().toISOString().slice(11, 19);
    const prefixStr = this.prefix ? `${ANSI.magenta}[${this.prefix}]${ANSI.reset} ` : "";
    const formatted = `${ANSI.gray}${time}${ANSI.reset} ${style.color}${style.label}${ANSI.reset} ${prefixStr}${ANSI.white}${message}${ANSI.reset}`;

    if (level === "error") {
      console.error(formatted, ...args);
    } else if (level === "warn") {
      console.warn(formatted, ...args);
    } else {
      console.log(formatted, ...args);
    }
  }
}

export type LoggerSink = (level: LogLevel, source: string, message: string) => void;
let _loggerSink: LoggerSink | null = null;
export function setLoggerSink(s: LoggerSink | null): void {
  _loggerSink = s;
}

/** Shared ANSI helpers for CLI scripts — each wraps text with color + reset */
export const ansi = {
  reset: ANSI.reset,
  heading: (text: string): string => `${ANSI.bold}${ANSI.cyan}${text}${ANSI.reset}`,
  success: (text: string): string => `${ANSI.green}${text}${ANSI.reset}`,
  warn: (text: string): string => `${ANSI.yellow}${text}${ANSI.reset}`,
  error: (text: string): string => `${ANSI.red}${text}${ANSI.reset}`,
  info: (text: string): string => `${ANSI.cyan}${text}${ANSI.reset}`,
  gray: (text: string): string => `${ANSI.gray}${text}${ANSI.reset}`,
  white: (text: string): string => `${ANSI.white}${text}${ANSI.reset}`,
  dim: (text: string): string => `${ANSI.dim}${text}${ANSI.reset}`,
  bold: (text: string): string => `${ANSI.bold}${text}${ANSI.reset}`,
  green: (text: string): string => `${ANSI.green}${text}${ANSI.reset}`,
  red: (text: string): string => `${ANSI.red}${text}${ANSI.reset}`,
  cyan: (text: string): string => `${ANSI.cyan}${text}${ANSI.reset}`,
  yellow: (text: string): string => `${ANSI.yellow}${text}${ANSI.reset}`,
} as const;
