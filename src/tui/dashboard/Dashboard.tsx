import type { Renderer } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { COLORS } from "../../config/tui-colors";

// --- Interfaces ---
interface LogEntry {
  readonly id: number;
  readonly timestamp: string;
  readonly level: "info" | "success" | "warning" | "error";
  readonly message: string;
}

interface Stats {
  readonly booksFound: number;
  readonly pagesScraped: number;
  readonly errors: number;
  readonly queueSize: number;
  readonly cpuUsage: number;
  readonly memoryUsage: number;
}

interface StatCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly color?: string;
}

interface LogPanelProps {
  readonly logs: readonly LogEntry[];
}

interface ProgressBarProps {
  readonly progress: number;
  readonly label: string;
}

interface DashboardProps {
  readonly renderer: Renderer;
}

interface KeyboardKey {
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

const LEVEL_COLORS: Record<LogEntry["level"], string> = {
  info: COLORS.TEXT_BRIGHT,
  success: "green",
  warning: "yellow",
  error: "red",
} as const;

// --- Componentes ---

function StatCard({ title, value, color }: StatCardProps): JSX.Element {
  const textColor: string = COLORS.SECONDARY;
  const valueColor: string = color || COLORS.TEXT_BRIGHT;

  return (
    <box
      borderStyle="rounded"
      borderColor={COLORS.SECONDARY}
      paddingX={1}
      flexDirection="column"
      flexGrow={1}
    >
      <text fg={textColor}>{title}</text>
      <text fg={valueColor} bold>
        {String(value)}
      </text>
    </box>
  );
}

function LogPanel({ logs }: LogPanelProps): JSX.Element {
  const visibleLogs: LogEntry[] = logs.slice(-12);

  return (
    <box
      borderStyle="rounded"
      title="Activity Log"
      flexDirection="column"
      flexGrow={2}
      paddingX={1}
    >
      {visibleLogs.map((log: LogEntry) => (
        <box key={log.id} flexDirection="row" gap={1}>
          <text fg={COLORS.SECONDARY}>[{log.timestamp}]</text>
          <text fg={LEVEL_COLORS[log.level]}>{log.message}</text>
        </box>
      ))}
    </box>
  );
}

function ProgressBar({ progress, label }: ProgressBarProps): JSX.Element {
  const width = 40;
  const filled: number = Math.floor((progress / 100) * width);
  const empty: number = width - filled;
  const bar: string = "█".repeat(filled) + "░".repeat(empty);

  return (
    <box flexDirection="column" padding={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text>{label}</text>
        <text>{progress.toFixed(1)}%</text>
      </box>
      <text fg="blue">{bar}</text>
    </box>
  );
}

// --- App Principal ---

export function Dashboard({ renderer }: DashboardProps): JSX.Element {
  const [stats, setStats] = useState<Stats>({
    booksFound: 0,
    pagesScraped: 0,
    errors: 0,
    queueSize: 150,
    cpuUsage: 12,
    memoryUsage: 256,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useKeyboard((key: KeyboardKey) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      if (renderer) {
        renderer.destroy();
      }
      process.exit(0);
    }
  });

  useEffect(() => {
    const actions = [
      { msg: "Parsing page...", level: "info" },
      { msg: "Found book: 'The Pragmatic Programmer'", level: "success" },
      { msg: "Extracting metadata...", level: "info" },
      { msg: "Saving to database...", level: "info" },
      { msg: "Connection timeout retrying...", level: "warning" },
      { msg: "Found book: 'Clean Code'", level: "success" },
      { msg: "Rate limit detected, pausing...", level: "warning" },
      { msg: "Found book: 'Refactoring UI'", level: "success" },
      { msg: "Failed to parse image", level: "error" },
    ] as const;

    const intervalId: ReturnType<typeof setInterval> = setInterval(() => {
      setStats((prev: Stats) => ({
        booksFound: prev.booksFound + (Math.random() > 0.7 ? 1 : 0),
        pagesScraped: prev.pagesScraped + 1,
        errors: prev.errors + (Math.random() > 0.95 ? 1 : 0),
        queueSize: Math.max(0, prev.queueSize - 1),
        cpuUsage: Math.floor(10 + Math.random() * 30),
        memoryUsage: Math.floor(256 + Math.random() * 50),
      }));

      if (Math.random() > 0.3) {
        const action = actions[Math.floor(Math.random() * actions.length)];
        const now: Date = new Date();
        const timeString: string = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

        setLogs((prev: LogEntry[]) => [
          ...prev,
          {
            id: logIdRef.current++,
            timestamp: timeString,
            level: action.level,
            message: action.msg,
          },
        ]);
      }
    }, 800);

    timerRef.current = intervalId;

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return (
    <box flexDirection="column" width="100%" height="100%" padding={0}>
      <box borderStyle="rounded" borderColor={COLORS.PRIMARY} padding={0} justifyContent="center">
        <text bold>📚 BUN BOOK CRAWLER - DASHBOARD (SIMULATION)</text>
      </box>

      <box flexDirection="row" flexGrow={1} gap={0} marginTop={0}>
        <box flexDirection="column" width="30%" gap={0}>
          <StatCard title="Books Found" value={stats.booksFound} color="green" />
          <StatCard title="Pages Scraped" value={stats.pagesScraped} color="blue" />
          <StatCard title="Errors" value={stats.errors} color="red" />
          <StatCard title="Queue Pending" value={stats.queueSize} color="yellow" />
          <box borderStyle="rounded" title="System" flexDirection="column" padding={0}>
            <text>CPU: {stats.cpuUsage}%</text>
            <text>RAM: {stats.memoryUsage}MB</text>
          </box>
        </box>
        <LogPanel logs={logs} />
      </box>

      <box borderStyle="rounded" marginTop={0}>
        <ProgressBar
          progress={(stats.pagesScraped / (stats.pagesScraped + stats.queueSize)) * 100}
          label="Batch Progress"
        />
      </box>

      <box marginTop={0} paddingX={1}>
        <text fg={COLORS.TEXT_DIM}>Press 'q' or 'Ctrl+C' to exit simulation.</text>
      </box>
    </box>
  );
}
