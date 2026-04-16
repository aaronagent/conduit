// ---------------------------------------------------------------------------
// Pretty terminal log formatter — converts LogEvent into colorized one-liners.
// ---------------------------------------------------------------------------

import type { LogEvent } from "./log-event";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const useColor = !process.env.NO_COLOR;

const dim = (s: string) => (useColor ? `\x1b[2m${s}\x1b[22m` : s);
const bold = (s: string) => (useColor ? `\x1b[1m${s}\x1b[22m` : s);
const green = (s: string) => (useColor ? `\x1b[32m${s}\x1b[39m` : s);
const red = (s: string) => (useColor ? `\x1b[31m${s}\x1b[39m` : s);
const yellow = (s: string) => (useColor ? `\x1b[33m${s}\x1b[39m` : s);
const cyan = (s: string) => (useColor ? `\x1b[36m${s}\x1b[39m` : s);

/** Format unix-ms timestamp to "HH:MM:SS" local time. */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function shortenModel(model: string): string {
  return model.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    const seconds = ms / 1000;
    return `${seconds % 1 === 0 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Format a LogEvent into a pretty terminal line.
 * Returns `null` for event types that should be suppressed (e.g. sse_chunk).
 */
export function formatEvent(event: LogEvent): string | null {
  const time = dim(formatTime(event.ts));
  const data = event.data ?? {};

  switch (event.type) {
    case "system":
      return formatSystem(time, event);

    case "request_start":
      return formatRequestStart(time, data);

    case "request_end":
      return formatRequestEnd(time, data);

    case "upstream_error":
      return `${time} ${red("ERR")}  ${event.msg}`;

    case "sse_chunk":
      return null;

    default:
      return `${time} ${event.msg}`;
  }
}

function formatSystem(time: string, event: LogEvent): string {
  const levelTag = formatLevelTag(event.level);
  return `${time} ${levelTag}  ${event.msg}`;
}

function formatRequestStart(
  time: string,
  data: Record<string, unknown>,
): string {
  const model = cyan(bold(shortenModel(String(data.model ?? "unknown"))));
  const streamTag = data.stream ? "stream" : "sync";
  return [time, green("──▶"), model, dim(streamTag)].join("  ");
}

function formatRequestEnd(
  time: string,
  data: Record<string, unknown>,
): string {
  const statusCode = data.statusCode as number | null | undefined;
  const isError = data.status === "error" || (statusCode !== null && statusCode !== undefined && statusCode >= 400);
  const model = cyan(bold(shortenModel(String(data.model ?? "unknown"))));

  if (isError) {
    const status = red(String(statusCode ?? "err"));
    const dur = formatDuration(Number(data.latencyMs ?? 0));
    const errorMsg = data.error ? dim(String(data.error).slice(0, 80)) : "";
    return [time, red("✗──"), model, status, dim(dur), errorMsg].filter(Boolean).join("  ");
  }

  const status = green(String(statusCode ?? 200));
  const dur = formatDuration(Number(data.latencyMs ?? 0));
  const inputTok = data.inputTokens ?? 0;
  const outputTok = data.outputTokens ?? 0;
  const tokens = dim(`${inputTok}→${outputTok} tok`);
  return [time, green("◀──"), model, status, dim(dur), tokens].join("  ");
}

function formatLevelTag(level: string): string {
  switch (level) {
    case "debug":
      return dim("DBG");
    case "info":
      return green("INF");
    case "warn":
      return yellow("WRN");
    case "error":
      return red("ERR");
    default:
      return level.toUpperCase();
  }
}
