import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface CSPDirective {
  name: string;
  sources: string[];
  enabled: boolean;
}

export interface CSPPolicy {
  directives: Record<string, CSPDirective>;
  reportOnly: boolean;
  reportUri?: string;
  enableReporting: boolean;
}

export interface CSPViolationReport {
  cspReport: {
    documentURI: string;
    referrer: string;
    violatedDirective: string;
    effectiveDirective: string;
    originalPolicy: string;
    disposition: string;
    blockedURI: string;
    lineNumber?: number;
    columnNumber?: number;
    sourceFile?: string;
    statusCode?: number;
  };
  timestamp: Date;
  userAgent: string;
  clientIP: string;
}

export interface CSPAnalytics {
  totalViolations: number;
  violationsByDirective: Record<string, number>;
  violationsBySource: Record<string, number>;
  topViolations: CSPViolationReport[];
  reportCount: number;
  lastReport: Date;
}

@Injectable()
export class CSPManager {
  private readonly logger = new Logger(CSPManager.name);
  private violationReports: CSPViolationReport[] = [];
  private analytics: CSPAnalytics = {
    totalViolations: 0,
    violationsByDirective: {},
    violationsBySource: {},
    topViolations: [],
    reportCount: 0,
    lastReport: new Date(),
  };

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get default CSP policy
   */
  getDefaultPolicy(): CSPPolicy {
    return {
      directives: {
        'default-src': {
          name: 'default-src',
          sources: ["'self'"],
          enabled: true,
        },
        'script-src': {
          name: 'script-src',
          sources: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          enabled: true,
        },
        'style-src': {
          name: 'style-src',
          sources: ["'self'", "'unsafe-inline'"],
          enabled: true,
        },
        'img-src': {
          name: 'img-src',
          sources: ["'self'", 'data:', 'https:'],
          enabled: true,
        },
        'font-src': {
          name: 'font-src',
          sources: ["'self'", 'data:'],
          enabled: true,
        },
        'connect-src': {
          name: 'connect-src',
          sources: ["'self'", 'https:', 'wss:'],
          enabled: true,
        },
        'media-src': {
          name: 'media-src',
          sources: ["'self'"],
          enabled: true,
        },
        'object-src': {
          name: 'object-src',
          sources: ["'none'"],
          enabled: true,
        },
        'base-uri': {
          name: 'base-uri',
          sources: ["'self'"],
          enabled: true,
        },
        'form-action': {
          name: 'form-action',
          sources: ["'self'"],
          enabled: true,
        },
        'frame-ancestors': {
          name: 'frame-ancestors',
          sources: ["'none'"],
          enabled: true,
        },
        'worker-src': {
          name: 'worker-src',
          sources: ["'self'"],
          enabled: true,
        },
        'manifest-src': {
          name: 'manifest-src',
          sources: ["'self'"],
          enabled: true,
        },
        'prefetch-src': {
          name: 'prefetch-src',
          sources: ["'self'"],
          enabled: true,
        },
      },
      reportOnly: this.configService.get<boolean>('CSP_REPORT_ONLY', false),
      reportUri: this.configService.get<string>('CSP_REPORT_URI'),
      enableReporting: this.configService.get<boolean>('CSP_ENABLE_REPORTING', true),
    };
  }

  /**
   * Get production CSP policy (more restrictive)
   */
  getProductionPolicy(): CSPPolicy {
    return {
      directives: {
        'default-src': {
          name: 'default-src',
          sources: ["'self'"],
          enabled: true,
        },
        'script-src': {
          name: 'script-src',
          sources: ["'self'", "'nonce-{{nonce}}'"],
          enabled: true,
        },
        'style-src': {
          name: 'style-src',
          sources: ["'self'", "'nonce-{{nonce}}'"],
          enabled: true,
        },
        'img-src': {
          name: 'img-src',
          sources: ["'self'", 'data:', 'https:'],
          enabled: true,
        },
        'font-src': {
          name: 'font-src',
          sources: ["'self'", 'data:'],
          enabled: true,
        },
        'connect-src': {
          name: 'connect-src',
          sources: ["'self'", 'https:', 'wss:'],
          enabled: true,
        },
        'media-src': {
          name: 'media-src',
          sources: ["'self'"],
          enabled: true,
        },
        'object-src': {
          name: 'object-src',
          sources: ["'none'"],
          enabled: true,
        },
        'base-uri': {
          name: 'base-uri',
          sources: ["'self'"],
          enabled: true,
        },
        'form-action': {
          name: 'form-action',
          sources: ["'self'"],
          enabled: true,
        },
        'frame-ancestors': {
          name: 'frame-ancestors',
          sources: ["'none'"],
          enabled: true,
        },
        'worker-src': {
          name: 'worker-src',
          sources: ["'self'"],
          enabled: true,
        },
        'manifest-src': {
          name: 'manifest-src',
          sources: ["'self'"],
          enabled: true,
        },
        'prefetch-src': {
          name: 'prefetch-src',
          sources: ["'self'"],
          enabled: true,
        },
        'upgrade-insecure-requests': {
          name: 'upgrade-insecure-requests',
          sources: [],
          enabled: true,
        },
      },
      reportOnly: false,
      reportUri: this.configService.get<string>('CSP_REPORT_URI', '/api/v1/security/csp-report'),
      enableReporting: true,
    };
  }

  /**
   * Get development CSP policy (less restrictive)
   */
  getDevelopmentPolicy(): CSPPolicy {
    return {
      directives: {
        'default-src': {
          name: 'default-src',
          sources: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          enabled: true,
        },
        'script-src': {
          name: 'script-src',
          sources: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'localhost:3000', '127.0.0.1:3000'],
          enabled: true,
        },
        'style-src': {
          name: 'style-src',
          sources: ["'self'", "'unsafe-inline'", 'localhost:3000', '127.0.0.1:3000'],
          enabled: true,
        },
        'img-src': {
          name: 'img-src',
          sources: ["'self'", 'data:', 'https:', 'http:'],
          enabled: true,
        },
        'font-src': {
          name: 'font-src',
          sources: ["'self'", 'data:'],
          enabled: true,
        },
        'connect-src': {
          name: 'connect-src',
          sources: ["'self'", 'https:', 'wss:', 'ws:', 'localhost:3000', '127.0.0.1:3000'],
          enabled: true,
        },
        'media-src': {
          name: 'media-src',
          sources: ["'self'"],
          enabled: true,
        },
        'object-src': {
          name: 'object-src',
          sources: ["'none'"],
          enabled: true,
        },
        'base-uri': {
          name: 'base-uri',
          sources: ["'self'"],
          enabled: true,
        },
        'form-action': {
          name: 'form-action',
          sources: ["'self'"],
          enabled: true,
        },
        'frame-ancestors': {
          name: 'frame-ancestors',
          sources: ["'none'"],
          enabled: true,
        },
        'worker-src': {
          name: 'worker-src',
          sources: ["'self'"],
          enabled: true,
        },
        'manifest-src': {
          name: 'manifest-src',
          sources: ["'self'"],
          enabled: true,
        },
        'prefetch-src': {
          name: 'prefetch-src',
          sources: ["'self'"],
          enabled: true,
        },
      },
      reportOnly: true,
      reportUri: this.configService.get<string>('CSP_REPORT_URI', '/api/v1/security/csp-report'),
      enableReporting: true,
    };
  }

  /**
   * Generate CSP header value from policy
   */
  generateCSPHeaderValue(policy: CSPPolicy, nonce?: string): string {
    const directives: string[] = [];

    for (const [directiveName, directive] of Object.entries(policy.directives)) {
      if (!directive.enabled) continue;

      let directiveValue = directiveName;
      
      if (directive.sources.length > 0) {
        let sources = [...directive.sources];
        
        // Replace nonce placeholder
        if (nonce) {
          sources = sources.map(source => source.replace('{{nonce}}', nonce));
        }
        
        directiveValue += ' ' + sources.join(' ');
      }
      
      directives.push(directiveValue);
    }

    // Add report-uri directive if reporting is enabled
    if (policy.enableReporting && policy.reportUri) {
      directives.push(`report-uri ${policy.reportUri}`);
    }

    return directives.join('; ');
  }

  /**
   * Generate nonce for CSP
   */
  generateNonce(): string {
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Process CSP violation report
   */
  processViolationReport(report: any, clientIP: string, userAgent: string): void {
    const violationReport: CSPViolationReport = {
      cspReport: report.cspReport,
      timestamp: new Date(),
      userAgent,
      clientIP,
    };

    // Store violation report
    this.violationReports.push(violationReport);
    
    // Update analytics
    this.updateAnalytics(violationReport);
    
    // Log violation
    this.logViolation(violationReport);
    
    // Keep only last 1000 reports to prevent memory issues
    if (this.violationReports.length > 1000) {
      this.violationReports = this.violationReports.slice(-1000);
    }
  }

  /**
   * Update CSP analytics
   */
  private updateAnalytics(report: CSPViolationReport): void {
    this.analytics.totalViolations++;
    this.analytics.reportCount++;
    this.analytics.lastReport = report.timestamp;

    // Update violations by directive
    const directive = report.cspReport.effectiveDirective;
    this.analytics.violationsByDirective[directive] = (this.analytics.violationsByDirective[directive] || 0) + 1;

    // Update violations by source
    const source = report.cspReport.blockedURI || 'unknown';
    this.analytics.violationsBySource[source] = (this.analytics.violationsBySource[source] || 0) + 1;

    // Update top violations
    this.analytics.topViolations = this.violationReports
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
  }

  /**
   * Log CSP violation
   */
  private logViolation(report: CSPViolationReport): void {
    const { cspReport } = report;
    
    this.logger.warn(
      `CSP Violation: ${cspReport.effectiveDirective} - ${cspReport.blockedURI} ` +
      `(${cspReport.documentURI}) from ${report.clientIP}`
    );
  }

  /**
   * Get CSP analytics
   */
  getAnalytics(): CSPAnalytics {
    return { ...this.analytics };
  }

  /**
   * Get violation reports
   */
  getViolationReports(limit?: number): CSPViolationReport[] {
    if (limit) {
      return this.violationReports.slice(-limit);
    }
    return [...this.violationReports];
  }

  /**
   * Get violation reports by directive
   */
  getViolationReportsByDirective(directive: string): CSPViolationReport[] {
    return this.violationReports.filter(
      report => report.cspReport.effectiveDirective === directive
    );
  }

  /**
   * Get violation reports by source
   */
  getViolationReportsBySource(source: string): CSPViolationReport[] {
    return this.violationReports.filter(
      report => report.cspReport.blockedURI === source
    );
  }

  /**
   * Clear violation reports
   */
  clearViolationReports(): void {
    this.violationReports = [];
    this.analytics = {
      totalViolations: 0,
      violationsByDirective: {},
      violationsBySource: {},
      topViolations: [],
      reportCount: 0,
      lastReport: new Date(),
    };
    this.logger.log('CSP violation reports cleared');
  }

  /**
   * Validate CSP policy
   */
  validatePolicy(policy: CSPPolicy): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required directives
    const requiredDirectives = ['default-src', 'script-src', 'style-src'];
    for (const directive of requiredDirectives) {
      if (!policy.directives[directive] || !policy.directives[directive].enabled) {
        errors.push(`Missing or disabled required directive: ${directive}`);
      }
    }

    // Validate directive sources
    for (const [directiveName, directive] of Object.entries(policy.directives)) {
      if (!directive.enabled) continue;

      for (const source of directive.sources) {
        if (!this.isValidCSPSource(source)) {
          errors.push(`Invalid source in ${directiveName}: ${source}`);
        }
      }
    }

    // Check policy length
    const policyValue = this.generateCSPHeaderValue(policy);
    if (policyValue.length > 4096) {
      errors.push('CSP policy is too long (max 4096 characters)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate CSP source
   */
  private isValidCSPSource(source: string): boolean {
    // Valid CSP sources include:
    // - 'self', 'none', 'unsafe-inline', 'unsafe-eval'
    // - 'nonce-<base64-value>'
    // - scheme: (http:, https:, data:, etc.)
    // - hostnames and IP addresses
    // - wildcard patterns
    
    const validKeywords = ["'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'"];
    if (validKeywords.includes(source)) {
      return true;
    }

    // Check for nonce
    if (source.startsWith("'nonce-") && source.endsWith("'")) {
      return true;
    }

    // Check for scheme
    if (source.endsWith(':')) {
      const scheme = source.slice(0, -1);
      return /^[a-z][a-z0-9+.-]*$/i.test(scheme);
    }

    // Check for hostname or IP
    if (/^[a-z0-9.-]+:[0-9]*$/i.test(source) || /^[0-9.]+:[0-9]*$/.test(source)) {
      return true;
    }

    // Check for wildcard
    if (source.includes('*')) {
      return true;
    }

    return false;
  }

  /**
   * Add custom directive to policy
   */
  addDirective(policy: CSPPolicy, directiveName: string, sources: string[], enabled: boolean = true): void {
    policy.directives[directiveName] = {
      name: directiveName,
      sources,
      enabled,
    };
  }

  /**
   * Remove directive from policy
   */
  removeDirective(policy: CSPPolicy, directiveName: string): void {
    delete policy.directives[directiveName];
  }

  /**
   * Update directive sources
   */
  updateDirective(policy: CSPPolicy, directiveName: string, sources: string[]): void {
    if (policy.directives[directiveName]) {
      policy.directives[directiveName].sources = sources;
    }
  }

  /**
   * Enable/disable directive
   */
  toggleDirective(policy: CSPPolicy, directiveName: string, enabled: boolean): void {
    if (policy.directives[directiveName]) {
      policy.directives[directiveName].enabled = enabled;
    }
  }

  /**
   * Get CSP recommendations based on violations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const { violationsByDirective, violationsBySource } = this.analytics;

    // Analyze violations and provide recommendations
    if (violationsByDirective['script-src'] > 10) {
      recommendations.push('Consider tightening script-src directive to reduce XSS risks');
    }

    if (violationsByDirective['style-src'] > 10) {
      recommendations.push('Consider removing unsafe-inline from style-src directive');
    }

    if (violationsByDirective['img-src'] > 20) {
      recommendations.push('Review img-src sources to prevent data exfiltration');
    }

    // Check for common problematic sources
    const problematicSources = Object.entries(violationsBySource)
      .filter(([_, count]) => count > 5)
      .map(([source]) => source);

    if (problematicSources.length > 0) {
      recommendations.push(`Consider explicitly allowing or blocking these sources: ${problematicSources.join(', ')}`);
    }

    if (this.analytics.totalViolations > 100) {
      recommendations.push('High number of violations detected. Consider switching to report-only mode temporarily');
    }

    return recommendations;
  }

  /**
   * Export CSP data
   */
  exportData(): any {
    return {
      analytics: this.analytics,
      violationReports: this.violationReports,
      exportDate: new Date(),
    };
  }

  /**
   * Import CSP data
   */
  importData(data: any): void {
    if (data.analytics) {
      this.analytics = { ...this.analytics, ...data.analytics };
    }
    
    if (data.violationReports) {
      this.violationReports = [...data.violationReports];
    }
    
    this.logger.log('CSP data imported successfully');
  }
}
