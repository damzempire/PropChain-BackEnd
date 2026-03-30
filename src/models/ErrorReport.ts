export type ErrorCategory =
  | 'VALIDATION'
  | 'AUTH'
  | 'DATABASE'
  | 'NETWORK'
  | 'EXTERNAL'
  | 'SERVER'
  | 'CLIENT'
  | 'UNKNOWN';

export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  rootCause: string;
  isTransient: boolean;
}

export interface ErrorReport {
  id: string;
  timestamp: string;
  correlationId?: string;
  source: string;
  message: string;
  stack?: string;
  httpStatus?: number;
  metadata?: Record<string, unknown>;
  classification: ErrorClassification;
}

export type RecoveryActionType = 'RETRY' | 'RESTART' | 'FALLBACK' | 'ESCALATE' | 'IGNORE';

export interface RecoveryResult {
  success: boolean;
  action: RecoveryActionType;
  attempts: number;
  message: string;
}

export interface IncidentRecord {
  incidentId: string;
  report: ErrorReport;
  openedAt: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  responders: string[];
  notes: string[];
}
