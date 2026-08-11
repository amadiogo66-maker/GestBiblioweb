export type LogLevel = 'info' | 'warn' | 'error';

interface LogPayload {
  [key: string]: string | number | boolean | null | undefined | LogPayload | LogPayload[];
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  payload?: LogPayload;
}

function writeLog(level: LogLevel, message: string, payload?: LogPayload): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    payload,
  };

  const serialized = JSON.stringify(entry);

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export const logger = {
  info: (message: string, payload?: LogPayload): void => writeLog('info', message, payload),
  warn: (message: string, payload?: LogPayload): void => writeLog('warn', message, payload),
  error: (message: string, payload?: LogPayload): void => writeLog('error', message, payload),
};
