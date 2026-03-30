import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCategory, ErrorSeverity, ErrorClassification, ErrorReport } from '../models/ErrorReport';

export class ErrorClassifier {
  classify(exception: unknown, source = 'application', correlationId?: string): ErrorReport {
    let message = 'Unknown error';
    let stack: string | undefined;
    let status: number | undefined;

    if (exception instanceof Error) {
      message = exception.message || exception.name;
      stack = exception.stack;

      if (exception instanceof HttpException) {
        status = exception.getStatus();
      }
    }

    const classification = this.classifyDetail(message, status);

    const report: ErrorReport = {
      id: this.uuidv4(),
      timestamp: new Date().toISOString(),
      correlationId,
      source,
      message,
      stack,
      httpStatus: status,
      metadata: {
        type: exception instanceof Error ? exception.name : typeof exception,
      },
      classification,
    };

    return report;
  }

  private classifyDetail(message: string, status?: number): ErrorClassification {
    const normalized = message.toLowerCase();

    const category = this.mapCategory(status, normalized);
    const severity = this.mapSeverity(category, normalized);

    return {
      category,
      severity,
      rootCause: this.mapRootCause(normalized),
      isTransient: this.isTransient(category, severity),
    };
  }

  private mapCategory(status?: number, normalizedMessage = ''): ErrorCategory {
    if (status) {
      if (status >= 500) return 'SERVER';
      if (status >= 400) return 'CLIENT';
      return 'UNKNOWN';
    }

    if (normalizedMessage.includes('validation') || normalizedMessage.includes('invalid')) {
      return 'VALIDATION';
    }

    if (
      normalizedMessage.includes('auth') ||
      normalizedMessage.includes('unauthorized') ||
      normalizedMessage.includes('forbidden')
    ) {
      return 'AUTH';
    }

    if (
      normalizedMessage.includes('prisma') ||
      normalizedMessage.includes('database') ||
      normalizedMessage.includes('typeorm') ||
      normalizedMessage.includes('constraint')
    ) {
      return 'DATABASE';
    }

    if (
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('timed out') ||
      normalizedMessage.includes('econnrefused')
    ) {
      return 'NETWORK';
    }

    if (
      normalizedMessage.includes('external') ||
      normalizedMessage.includes('upstream') ||
      normalizedMessage.includes('gateway')
    ) {
      return 'EXTERNAL';
    }

    return 'UNKNOWN';
  }

  private mapSeverity(category: ErrorCategory, normalizedMessage: string): ErrorSeverity {
    if (category === 'DATABASE' || category === 'SERVER' || category === 'EXTERNAL') {
      return 'HIGH';
    }

    if (category === 'VALIDATION' || category === 'CLIENT' || category === 'AUTH') {
      return 'MEDIUM';
    }

    if (
      normalizedMessage.includes('critical') ||
      normalizedMessage.includes('panic') ||
      normalizedMessage.includes('internal')
    ) {
      return 'CRITICAL';
    }

    return 'LOW';
  }

  private mapRootCause(normalizedMessage: string): string {
    if (normalizedMessage.includes('connection')) return 'Connection failure';
    if (normalizedMessage.includes('timeout')) return 'Timeout';
    if (normalizedMessage.includes('constraint')) return 'Data constraint violation';
    if (normalizedMessage.includes('auth')) return 'Authentication/authorization issue';
    if (normalizedMessage.includes('validation')) return 'Validation failure';

    return 'Unknown root cause';
  }

  private isTransient(category: ErrorCategory, severity: ErrorSeverity): boolean {
    if (category === 'NETWORK' || category === 'EXTERNAL') return true;
    if (category === 'DATABASE' && severity !== 'CRITICAL') return true;
    return false;
  }

  private uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
