import { Injectable, Logger } from '@nestjs/common';
import { ErrorReport, IncidentRecord } from '../models/ErrorReport';

@Injectable()
export class IncidentResponder {
  private readonly logger = new Logger(IncidentResponder.name);
  private incidents: Map<string, IncidentRecord> = new Map();

  createIncident(report: ErrorReport): IncidentRecord {
    const incidentId = `incident-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const incident: IncidentRecord = {
      incidentId,
      report,
      openedAt: new Date().toISOString(),
      status: 'OPEN',
      responders: [],
      notes: [`Incident created for error ${report.id}`],
    };

    this.incidents.set(incidentId, incident);
    this.logger.warn(`Incident created: ${incidentId} for ${report.id}`);
    return incident;
  }

  acknowledgeIncident(incidentId: string, responder: string): IncidentRecord | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.status = 'ACKNOWLEDGED';
    incident.responders.push(responder);
    incident.notes.push(`Acknowledged by ${responder} at ${new Date().toISOString()}`);
    this.logger.log(`Incident ${incidentId} acknowledged by ${responder}`);
    return incident;
  }

  resolveIncident(incidentId: string, note?: string): IncidentRecord | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.status = 'RESOLVED';
    incident.notes.push(`Resolved at ${new Date().toISOString()}` + (note ? `: ${note}` : ''));
    this.logger.log(`Incident ${incidentId} resolved`);
    return incident;
  }

  getIncident(incidentId: string): IncidentRecord | undefined {
    return this.incidents.get(incidentId);
  }

  listIncidents(status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'): IncidentRecord[] {
    const result = Array.from(this.incidents.values());
    return status ? result.filter(i => i.status === status) : result;
  }

  addNote(incidentId: string, note: string): IncidentRecord | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;
    incident.notes.push(`${new Date().toISOString()}: ${note}`);
    return incident;
  }
}
