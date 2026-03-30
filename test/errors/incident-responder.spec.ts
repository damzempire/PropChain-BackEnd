import { IncidentResponder } from '../../src/errors/IncidentResponder';
import { ErrorClassifier } from '../../src/errors/ErrorClassifier';

describe('IncidentResponder', () => {
  let responder: IncidentResponder;
  let classifier: ErrorClassifier;

  beforeEach(() => {
    responder = new IncidentResponder();
    classifier = new ErrorClassifier();
  });

  it('creates and resolves an incident', () => {
    const report = classifier.classify(new Error('Critical panic'), 'tests');
    const incident = responder.createIncident(report);

    expect(incident.status).toBe('OPEN');
    const ack = responder.acknowledgeIncident(incident.incidentId, 'ops');
    expect(ack?.status).toBe('ACKNOWLEDGED');

    const resolved = responder.resolveIncident(incident.incidentId, 'fixed');
    expect(resolved?.status).toBe('RESOLVED');
  });

  it('lists incidents by status', () => {
    const report = classifier.classify(new Error('Another error'), 'tests');
    const incident = responder.createIncident(report);
    const openList = responder.listIncidents('OPEN');
    expect(openList).toHaveLength(1);

    responder.resolveIncident(incident.incidentId);
    const closedList = responder.listIncidents('RESOLVED');
    expect(closedList).toHaveLength(1);
  });
});
