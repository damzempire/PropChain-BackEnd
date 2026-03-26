import { Logger, LogEntry } from '../../src/lib/logger';

// Capture stdout/stderr writes
function captureOutput(fn: () => void): { stdout: LogEntry[]; stderr: LogEntry[] } {
  const stdout: LogEntry[] = [];
  const stderr: LogEntry[] = [];

  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk: string) => {
    stdout.push(JSON.parse(chunk));
    return true;
  };
  process.stderr.write = (chunk: string) => {
    stderr.push(JSON.parse(chunk));
    return true;
  };

  try {
    fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }

  return { stdout, stderr };
}

describe('Logger', () => {
  describe('log levels', () => {
    it('logs debug when minLevel is debug', () => {
      const log = new Logger({ minLevel: 'debug' });
      const { stdout } = captureOutput(() => log.debug('test debug'));
      expect(stdout).toHaveLength(1);
      expect(stdout[0].level).toBe('debug');
      expect(stdout[0].message).toBe('test debug');
    });

    it('suppresses debug when minLevel is info', () => {
      const log = new Logger({ minLevel: 'info' });
      const { stdout } = captureOutput(() => log.debug('suppressed'));
      expect(stdout).toHaveLength(0);
    });

    it('writes warn and error to stderr', () => {
      const log = new Logger({ minLevel: 'debug' });
      const { stderr } = captureOutput(() => {
        log.warn('a warning');
        log.error('an error');
      });
      expect(stderr).toHaveLength(2);
      expect(stderr[0].level).toBe('warn');
      expect(stderr[1].level).toBe('error');
    });

    it('is fully silent when minLevel is silent', () => {
      const log = new Logger({ minLevel: 'silent' });
      const { stdout, stderr } = captureOutput(() => {
        log.debug('x');
        log.info('x');
        log.warn('x');
        log.error('x');
      });
      expect(stdout).toHaveLength(0);
      expect(stderr).toHaveLength(0);
    });
  });

  describe('log entry structure', () => {
    it('includes timestamp in ISO format', () => {
      const log = new Logger({ minLevel: 'info' });
      const { stdout } = captureOutput(() => log.info('hello'));
      expect(stdout[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes context when provided', () => {
      const log = new Logger({ context: 'UserService', minLevel: 'info' });
      const { stdout } = captureOutput(() => log.info('created'));
      expect(stdout[0].context).toBe('UserService');
    });

    it('omits context when not provided', () => {
      const log = new Logger({ minLevel: 'info' });
      const { stdout } = captureOutput(() => log.info('hello'));
      expect(stdout[0].context).toBeUndefined();
    });

    it('includes structured data', () => {
      const log = new Logger({ minLevel: 'info' });
      const { stdout } = captureOutput(() => log.info('payload', { userId: 42 }));
      expect(stdout[0].data).toEqual({ userId: 42 });
    });

    it('serializes error details on error()', () => {
      const log = new Logger({ minLevel: 'error' });
      const err = new Error('boom');
      const { stderr } = captureOutput(() => log.error('failed', err));
      expect(stderr[0].error?.name).toBe('Error');
      expect(stderr[0].error?.message).toBe('boom');
    });
  });

  describe('child logger', () => {
    it('inherits minLevel and adds context', () => {
      const root = new Logger({ minLevel: 'info' });
      const child = root.child('PaymentService');
      const { stdout } = captureOutput(() => child.info('charged'));
      expect(stdout[0].context).toBe('PaymentService');
    });
  });
});
