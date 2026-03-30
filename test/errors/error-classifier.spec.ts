import { ErrorClassifier } from '../../src/errors/ErrorClassifier';

describe('ErrorClassifier', () => {
  let classifier: ErrorClassifier;

  beforeEach(() => {
    classifier = new ErrorClassifier();
  });

  it('classifies validation errors correctly', () => {
    const error = new Error('Validation failed for field foo');
    const report = classifier.classify(error, 'tests', 'corr-1');
    expect(report.classification.category).toBe('VALIDATION');
    expect(report.classification.isTransient).toBe(false);
    expect(report.correlationId).toBe('corr-1');
  });

  it('classifies network timeout as network and transient', () => {
    const error = new Error('Connection timeout while calling service');
    const report = classifier.classify(error, 'tests');
    expect(report.classification.category).toBe('NETWORK');
    expect(report.classification.isTransient).toBe(true);
  });
});
