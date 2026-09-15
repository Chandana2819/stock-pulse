// Structured logging.
//
// No external transport is wired up (no Sentry/Datadog/etc. — that requires
// an account and keys this environment doesn't have), but every log line is
// now a single JSON object with a level, a timestamp, and whatever
// context (requestId, userId, route...) the caller attaches. That's the
// prerequisite for wiring in a real log aggregator or error tracker later:
// they all expect structured lines, not ad-hoc interpolated strings, and
// retrofitting that onto free-text logs after the fact means re-touching
// every call site anyway.

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context?: LogContext) {
  const line = {
    level,
    time: new Date().toISOString(),
    message,
    ...context,
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  /** `err` is normalized to a plain {message, stack} shape so JSON.stringify doesn't drop it (Error objects serialize to `{}` by default). */
  error: (message: string, err?: unknown, context?: LogContext) => {
    const errInfo =
      err instanceof Error
        ? { errorMessage: err.message, errorStack: err.stack }
        : err !== undefined
          ? { errorMessage: String(err) }
          : {};
    write("error", message, { ...errInfo, ...context });
  },
};
