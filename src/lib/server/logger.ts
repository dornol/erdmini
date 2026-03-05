type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	module: string;
	message: string;
	detail?: Record<string, unknown>;
	error?: string;
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getLogLevel(): number {
	const env = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
	return LEVELS[env ?? 'info'] ?? LEVELS.info;
}

function isJsonFormat(): boolean {
	return process.env.LOG_FORMAT?.toLowerCase() === 'json';
}

function formatText(level: LogLevel, module: string, message: string, detail?: Record<string, unknown>): string {
	const detailStr = detail ? ' ' + JSON.stringify(detail) : '';
	return `[${module}] ${message}${detailStr}`;
}

function emit(level: LogLevel, module: string, message: string, detail?: Record<string, unknown>): void {
	try {
		if (LEVELS[level] < getLogLevel()) return;

		if (isJsonFormat()) {
			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level,
				module,
				message,
			};
			if (detail) entry.detail = detail;
			if (detail?.error) {
				entry.error = String(detail.error);
				delete entry.detail!.error;
				if (Object.keys(entry.detail!).length === 0) delete entry.detail;
			}
			process.stdout.write(JSON.stringify(entry) + '\n');
		} else {
			const text = formatText(level, module, message, detail);
			if (level === 'error') {
				console.error(text);
			} else if (level === 'warn') {
				console.warn(text);
			} else {
				console.log(text);
			}
		}
	} catch {
		// 로깅 장애가 애플리케이션에 전파되지 않도록 모든 예외를 삼킴
	}
}

export const logger = {
	debug(module: string, message: string, detail?: Record<string, unknown>) { emit('debug', module, message, detail); },
	info(module: string, message: string, detail?: Record<string, unknown>) { emit('info', module, message, detail); },
	warn(module: string, message: string, detail?: Record<string, unknown>) { emit('warn', module, message, detail); },
	error(module: string, message: string, detail?: Record<string, unknown>) { emit('error', module, message, detail); },
};
