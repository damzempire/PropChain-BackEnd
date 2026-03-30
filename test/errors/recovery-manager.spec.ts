import { RecoveryManager } from '../../src/errors/RecoveryManager';
import { ErrorClassifier } from '../../src/errors/ErrorClassifier';

describe('RecoveryManager', () => {
  let recovery: RecoveryManager;
  let classifier: ErrorClassifier;

  beforeEach(() => {
    recovery = new RecoveryManager();
    classifier = new ErrorClassifier();
  });

  it('executes retry flow for transient errors', async () => {
    const report = classifier.classify(new Error('External service timeout'), 'tests');
    const result = await recovery.recover(report);
    expect(['RETRY', 'ESCALATE']).toContain(result.action);
    expect(result.attempts).toBeGreaterThanOrEqual(0);
  });

  it('attempts database restart for database errors', async () => {
    const report = classifier.classify(new Error('Prisma database constraint failure'), 'tests');
    const result = await recovery.recover(report);
    expect(result.action).toBe('RESTART');
  });
});
