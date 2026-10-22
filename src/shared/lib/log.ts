type LogContext = Readonly<Record<string, unknown>>;

type LogSink = {
  readonly error: (message: string, error: unknown, context: LogContext) => void;
  readonly warn: (message: string, context: LogContext) => void;
};

const consoleSink: LogSink = {
  error: (message, error, context) => {
    console.error(message, error, context);
  },
  warn: (message, context) => {
    console.warn(message, context);
  },
};

let sink: LogSink = consoleSink;

export function setLogSink(next: LogSink): void {
  sink = next;
}

export const log = {
  error(message: string, error: unknown, context: LogContext = {}): void {
    sink.error(message, error, context);
  },
  warn(message: string, context: LogContext = {}): void {
    sink.warn(message, context);
  },
};
