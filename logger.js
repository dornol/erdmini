// Structured logger for plain JS files (server.js, collab-server.js)
// Mirrors src/lib/server/logger.ts logic

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function getLogLevel() {
	const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
	return LEVELS[env] ?? LEVELS.info;
}

function isJsonFormat() {
	return (process.env.LOG_FORMAT || '').toLowerCase() === 'json';
}

function emit(level, module, message, detail) {
	try {
		if (LEVELS[level] < getLogLevel()) return;

		if (isJsonFormat()) {
			const entry = {
				timestamp: new Date().toISOString(),
				level,
				module,
				message,
			};
			if (detail) {
				const d = { ...detail };
				if (d.error) {
					entry.error = String(d.error);
					delete d.error;
					if (Object.keys(d).length > 0) entry.detail = d;
				} else {
					entry.detail = d;
				}
			}
			process.stdout.write(JSON.stringify(entry) + '\n');
		} else {
			const detailStr = detail ? ' ' + JSON.stringify(detail) : '';
			const text = `[${module}] ${message}${detailStr}`;
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

export function createLogger(defaultModule) {
	return {
		debug(message, detail) { emit('debug', defaultModule, message, detail); },
		info(message, detail) { emit('info', defaultModule, message, detail); },
		warn(message, detail) { emit('warn', defaultModule, message, detail); },
		error(message, detail) { emit('error', defaultModule, message, detail); },
	};
}

export const logger = {
	debug(module, message, detail) { emit('debug', module, message, detail); },
	info(module, message, detail) { emit('info', module, message, detail); },
	warn(module, message, detail) { emit('warn', module, message, detail); },
	error(module, message, detail) { emit('error', module, message, detail); },
};
