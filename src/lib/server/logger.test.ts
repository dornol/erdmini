import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test with different env configurations, so we manipulate process.env directly
describe('logger', () => {
	let writeSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let warnSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		delete process.env.LOG_FORMAT;
		delete process.env.LOG_LEVEL;
	});

	afterEach(() => {
		writeSpy.mockRestore();
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
		delete process.env.LOG_FORMAT;
		delete process.env.LOG_LEVEL;
	});

	// Re-import each test to pick up fresh env
	async function getLogger() {
		const mod = await import('./logger');
		return mod.logger;
	}

	describe('text format (default)', () => {
		it('outputs bracket prefix format via console.log for info', async () => {
			const logger = await getLogger();
			logger.info('server', 'Test message');
			expect(logSpy).toHaveBeenCalledWith('[server] Test message');
		});

		it('outputs via console.warn for warn level', async () => {
			const logger = await getLogger();
			logger.warn('collab', 'Connection lost');
			expect(warnSpy).toHaveBeenCalledWith('[collab] Connection lost');
		});

		it('outputs via console.error for error level', async () => {
			const logger = await getLogger();
			logger.error('auth', 'Auth failed');
			expect(errorSpy).toHaveBeenCalledWith('[auth] Auth failed');
		});

		it('appends detail as JSON', async () => {
			const logger = await getLogger();
			logger.info('migrate', 'Applied', { version: 5 });
			expect(logSpy).toHaveBeenCalledWith('[migrate] Applied {"version":5}');
		});
	});

	describe('JSON format', () => {
		it('outputs JSON Lines to stdout', async () => {
			process.env.LOG_FORMAT = 'json';
			const logger = await getLogger();
			logger.info('server', 'Started', { port: 3000 });

			expect(writeSpy).toHaveBeenCalledTimes(1);
			const output = (writeSpy.mock.calls[0][0] as string);
			expect(output.endsWith('\n')).toBe(true);

			const parsed = JSON.parse(output);
			expect(parsed.level).toBe('info');
			expect(parsed.module).toBe('server');
			expect(parsed.message).toBe('Started');
			expect(parsed.detail).toEqual({ port: 3000 });
			expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		it('extracts error field from detail', async () => {
			process.env.LOG_FORMAT = 'json';
			const logger = await getLogger();
			logger.error('server', 'Crash', { error: 'ECONNRESET', code: 'ERR' });

			const parsed = JSON.parse(writeSpy.mock.calls[0][0] as string);
			expect(parsed.error).toBe('ECONNRESET');
			expect(parsed.detail).toEqual({ code: 'ERR' });
		});

		it('removes empty detail after error extraction', async () => {
			process.env.LOG_FORMAT = 'json';
			const logger = await getLogger();
			logger.error('server', 'Fail', { error: 'boom' });

			const parsed = JSON.parse(writeSpy.mock.calls[0][0] as string);
			expect(parsed.error).toBe('boom');
			expect(parsed.detail).toBeUndefined();
		});

		it('does not use console.* in JSON mode', async () => {
			process.env.LOG_FORMAT = 'json';
			const logger = await getLogger();
			logger.info('test', 'msg');
			logger.warn('test', 'msg');
			logger.error('test', 'msg');

			expect(logSpy).not.toHaveBeenCalled();
			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();
		});
	});

	describe('LOG_LEVEL filtering', () => {
		it('filters out debug when level is info (default)', async () => {
			const logger = await getLogger();
			logger.debug('test', 'debug msg');
			expect(logSpy).not.toHaveBeenCalled();
			expect(writeSpy).not.toHaveBeenCalled();
		});

		it('allows info when level is info', async () => {
			const logger = await getLogger();
			logger.info('test', 'info msg');
			expect(logSpy).toHaveBeenCalled();
		});

		it('filters out info when level is warn', async () => {
			process.env.LOG_LEVEL = 'warn';
			const logger = await getLogger();
			logger.info('test', 'should not appear');
			expect(logSpy).not.toHaveBeenCalled();
		});

		it('allows warn when level is warn', async () => {
			process.env.LOG_LEVEL = 'warn';
			const logger = await getLogger();
			logger.warn('test', 'should appear');
			expect(warnSpy).toHaveBeenCalled();
		});

		it('allows error when level is warn', async () => {
			process.env.LOG_LEVEL = 'warn';
			const logger = await getLogger();
			logger.error('test', 'error msg');
			expect(errorSpy).toHaveBeenCalled();
		});

		it('only allows error when level is error', async () => {
			process.env.LOG_LEVEL = 'error';
			const logger = await getLogger();
			logger.debug('test', 'no');
			logger.info('test', 'no');
			logger.warn('test', 'no');
			logger.error('test', 'yes');

			expect(logSpy).not.toHaveBeenCalled();
			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalledTimes(1);
		});

		it('allows all levels when level is debug', async () => {
			process.env.LOG_LEVEL = 'debug';
			const logger = await getLogger();
			logger.debug('test', 'a');
			logger.info('test', 'b');
			logger.warn('test', 'c');
			logger.error('test', 'd');

			expect(logSpy).toHaveBeenCalledTimes(2); // debug + info
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('edge cases', () => {
		it('handles undefined detail', async () => {
			const logger = await getLogger();
			logger.info('test', 'no detail');
			expect(logSpy).toHaveBeenCalledWith('[test] no detail');
		});

		it('handles empty detail object', async () => {
			process.env.LOG_FORMAT = 'json';
			const logger = await getLogger();
			logger.info('test', 'empty', {});

			const parsed = JSON.parse(writeSpy.mock.calls[0][0] as string);
			expect(parsed.detail).toEqual({});
		});

		it('handles invalid LOG_LEVEL gracefully (defaults to info)', async () => {
			process.env.LOG_LEVEL = 'invalid';
			const logger = await getLogger();
			logger.info('test', 'should appear');
			expect(logSpy).toHaveBeenCalled();
		});

		it('is case-insensitive for LOG_FORMAT', async () => {
			process.env.LOG_FORMAT = 'JSON';
			const logger = await getLogger();
			logger.info('test', 'msg');
			expect(writeSpy).toHaveBeenCalled();
			expect(logSpy).not.toHaveBeenCalled();
		});

		it('is case-insensitive for LOG_LEVEL', async () => {
			process.env.LOG_LEVEL = 'WARN';
			const logger = await getLogger();
			logger.info('test', 'filtered');
			expect(logSpy).not.toHaveBeenCalled();
		});
	});

	describe('fault isolation (logging failures must not propagate)', () => {
		it('does not throw when JSON.stringify fails (circular reference in detail)', async () => {
			process.env.LOG_FORMAT = 'json';
			const logger = await getLogger();
			const circular: Record<string, unknown> = {};
			circular.self = circular;

			expect(() => logger.info('test', 'circular', circular)).not.toThrow();
		});

		it('does not throw when JSON.stringify fails in text mode', async () => {
			const logger = await getLogger();
			const circular: Record<string, unknown> = {};
			circular.self = circular;

			expect(() => logger.info('test', 'circular', circular)).not.toThrow();
		});

		it('does not throw when process.stdout.write fails', async () => {
			process.env.LOG_FORMAT = 'json';
			writeSpy.mockImplementation(() => { throw new Error('EPIPE'); });
			const logger = await getLogger();

			expect(() => logger.info('test', 'write fail')).not.toThrow();
		});

		it('does not throw when console.log fails', async () => {
			logSpy.mockImplementation(() => { throw new Error('console broken'); });
			const logger = await getLogger();

			expect(() => logger.info('test', 'console fail')).not.toThrow();
		});

		it('does not throw when console.warn fails', async () => {
			warnSpy.mockImplementation(() => { throw new Error('console broken'); });
			const logger = await getLogger();

			expect(() => logger.warn('test', 'console fail')).not.toThrow();
		});

		it('does not throw when console.error fails', async () => {
			errorSpy.mockImplementation(() => { throw new Error('console broken'); });
			const logger = await getLogger();

			expect(() => logger.error('test', 'console fail')).not.toThrow();
		});

		it('silently handles detail with non-serializable values', async () => {
			process.env.LOG_FORMAT = 'json';
			const logger = await getLogger();
			const detail = { fn: () => {}, bigint: BigInt(42) } as unknown as Record<string, unknown>;

			// BigInt causes JSON.stringify to throw TypeError
			expect(() => logger.info('test', 'weird detail', detail)).not.toThrow();
		});
	});
});
