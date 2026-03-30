import { Injectable, Logger } from '@nestjs/common';
import { ErrorReport, RecoveryResult, RecoveryActionType } from '../models/ErrorReport';

@Injectable()
export class RecoveryManager {
  private readonly logger = new Logger(RecoveryManager.name);
  private readonly maxRetryAttempts = 3;

  async recover(report: ErrorReport): Promise<RecoveryResult> {
    let attempts = 0;
    let action: RecoveryActionType = 'IGNORE';
    let success = false;
    let message = 'No recovery action required';

    if (report.classification.isTransient) {
      action = 'RETRY';
      for (attempts = 1; attempts <= this.maxRetryAttempts; attempts += 1) {
        this.logger.log(`Attempting recovery retry ${attempts}/${this.maxRetryAttempts} for ${report.id}`);

        if (await this.attemptRetry(report)) {
          success = true;
          message = `Recovered after ${attempts} attempts`;
          break;
        }
      }

      if (!success) {
        action = 'ESCALATE';
        message = 'Transient error did not clear after retries';
        await this.notifyEscalation(report);
      }
    } else if (report.classification.category === 'DATABASE') {
      action = 'RESTART';
      success = await this.attemptRestart(report);
      message = success ? 'Database recovery triggered' : 'Database recovery failed';
    } else if (report.classification.category === 'AUTH' || report.classification.category === 'VALIDATION') {
      action = 'IGNORE';
      message = 'No automated recovery for auth/validation issues';
      success = false;
    } else if (report.classification.category === 'SERVER') {
      action = 'FALLBACK';
      success = await this.applyFallback(report);
      message = success ? 'Fallback path used' : 'Fallback failed';
    }

    return {
      success,
      action,
      attempts,
      message,
    };
  }

  private async attemptRetry(report: ErrorReport): Promise<boolean> {
    const delayMs = 500 * Math.random() + 200; // jitter
    await new Promise(resolve => setTimeout(resolve, delayMs));

    return Math.random() > 0.4;
  }

  private async attemptRestart(report: ErrorReport): Promise<boolean> {
    this.logger.warn(`Attempting component restart due to report ${report.id}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }

  private async applyFallback(report: ErrorReport): Promise<boolean> {
    this.logger.warn(`Applying fallback mechanism for report ${report.id}`);
    await new Promise(resolve => setTimeout(resolve, 250));
    return true;
  }

  private async notifyEscalation(report: ErrorReport): Promise<void> {
    this.logger.error(`Escalating incident ${report.id} to on-call team`, report);
  }
}
