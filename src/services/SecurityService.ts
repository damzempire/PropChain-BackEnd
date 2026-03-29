import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityHeaders, SecurityHeaderPolicy } from '../security/SecurityHeaders';
import { CSPManager, CSPPolicy, CSPViolationReport, CSPAnalytics } from '../security/CSPManager';
import { SecurityScanner, SecurityScanResult, SecurityReport, ScanConfig } from '../security/SecurityScanner';
import * as fs from 'fs';
import * as path from 'path';

export interface SecurityConfig {
  enableSecurityHeaders: boolean;
  enableCSP: boolean;
  enableSecurityScanning: boolean;
  enableVulnerabilityReporting: boolean;
  environment: 'development' | 'staging' | 'production';
  scanSchedule: string; // cron expression
  alertThresholds: {
    criticalVulnerabilities: number;
    highVulnerabilities: number;
    cspViolations: number;
  };
}

export interface SecurityDashboard {
  overallScore: number;
  lastScanDate: Date;
  vulnerabilitySummary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  cspAnalytics: CSPAnalytics;
  securityHeaders: {
    enabled: number;
    total: number;
    compliance: number; // percentage
  };
  recentAlerts: SecurityAlert[];
  trends: {
    vulnerabilityTrend: number[];
    securityScoreTrend: number[];
    cspViolationTrend: number[];
  };
}

export interface SecurityAlert {
  id: string;
  type: 'VULNERABILITY' | 'CSP_VIOLATION' | 'HEADER_MISCONFIGURATION' | 'SCAN_FAILURE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: any;
}

@Injectable()
export class SecurityService implements OnModuleInit {
  private readonly logger = new Logger(SecurityService.name);
  private config: SecurityConfig;
  private alerts: SecurityAlert[] = [];
  private scanInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly securityHeaders: SecurityHeaders,
    private readonly cspManager: CSPManager,
    private readonly securityScanner: SecurityScanner,
  ) {}

  async onModuleInit(): Promise<void> {
    this.config = this.getDefaultConfig();
    
    // Setup scheduled security scans
    if (this.config.enableSecurityScanning) {
      this.setupScheduledScans();
    }

    this.logger.log('Security service initialized');
  }

  /**
   * Get default security configuration
   */
  private getDefaultConfig(): SecurityConfig {
    return {
      enableSecurityHeaders: this.configService.get<boolean>('SECURITY_ENABLE_HEADERS', true),
      enableCSP: this.configService.get<boolean>('SECURITY_ENABLE_CSP', true),
      enableSecurityScanning: this.configService.get<boolean>('SECURITY_ENABLE_SCANNING', true),
      enableVulnerabilityReporting: this.configService.get<boolean>('SECURITY_ENABLE_REPORTING', true),
      environment: this.configService.get<string>('NODE_ENV', 'development') as 'development' | 'staging' | 'production',
      scanSchedule: this.configService.get<string>('SECURITY_SCAN_SCHEDULE', '0 2 * * *'), // Daily at 2 AM
      alertThresholds: {
        criticalVulnerabilities: this.configService.get<number>('SECURITY_ALERT_CRITICAL_THRESHOLD', 1),
        highVulnerabilities: this.configService.get<number>('SECURITY_ALERT_HIGH_THRESHOLD', 5),
        cspViolations: this.configService.get<number>('SECURITY_ALERT_CSP_THRESHOLD', 50),
      },
    };
  }

  /**
   * Setup scheduled security scans
   */
  private setupScheduledScans(): void {
    // Simple implementation - in production you'd use a proper cron scheduler
    const intervalMs = 24 * 60 * 60 * 1000; // 24 hours
    this.scanInterval = setInterval(() => {
      this.performScheduledScan();
    }, intervalMs);
    
    this.logger.log(`Scheduled security scans configured (interval: ${intervalMs}ms)`);
  }

  /**
   * Perform scheduled security scan
   */
  private async performScheduledScan(): Promise<void> {
    try {
      this.logger.log('Starting scheduled security scan');
      
      const scanResult = await this.securityScanner.performSecurityScan();
      
      // Check for alerts based on thresholds
      this.checkForAlerts(scanResult);
      
      this.logger.log(`Scheduled scan completed: ${scanResult.summary.total} vulnerabilities found`);
      
    } catch (error: any) {
      this.logger.error(`Scheduled scan failed: ${error.message}`);
      
      // Create alert for scan failure
      this.createAlert({
        type: 'SCAN_FAILURE',
        severity: 'HIGH',
        title: 'Scheduled Security Scan Failed',
        description: error.message,
        metadata: { error: error.message, timestamp: new Date() },
      });
    }
  }

  /**
   * Get security headers for the application
   */
  getSecurityHeaders(): Record<string, string> {
    if (!this.config.enableSecurityHeaders) {
      return {};
    }

    let policy: Partial<SecurityHeaderPolicy>;
    
    switch (this.config.environment) {
      case 'production':
        policy = this.securityHeaders.getProductionPolicy();
        break;
      case 'staging':
        policy = this.securityHeaders.getDefaultPolicy();
        break;
      default:
        policy = this.securityHeaders.getDevelopmentPolicy();
    }

    return this.securityHeaders.getSecurityHeadersObject(policy);
  }

  /**
   * Get CSP header value
   */
  getCSPHeaderValue(nonce?: string): string | null {
    if (!this.config.enableCSP) {
      return null;
    }

    let policy: CSPPolicy;
    
    switch (this.config.environment) {
      case 'production':
        policy = this.cspManager.getProductionPolicy();
        break;
      case 'staging':
        policy = this.cspManager.getDefaultPolicy();
        break;
      default:
        policy = this.cspManager.getDevelopmentPolicy();
    }

    return this.cspManager.generateCSPHeaderValue(policy, nonce);
  }

  /**
   * Generate CSP nonce
   */
  generateCSPNonce(): string {
    return this.cspManager.generateNonce();
  }

  /**
   * Process CSP violation report
   */
  processCSPViolationReport(report: any, clientIP: string, userAgent: string): void {
    this.cspManager.processViolationReport(report, clientIP, userAgent);
    
    // Check for alert threshold
    const analytics = this.cspManager.getAnalytics();
    if (analytics.totalViolations > this.config.alertThresholds.cspViolations) {
      this.createAlert({
        type: 'CSP_VIOLATION',
        severity: 'MEDIUM',
        title: 'High CSP Violation Rate',
        description: `CSP violations exceeded threshold: ${analytics.totalViolations}`,
        metadata: { analytics, threshold: this.config.alertThresholds.cspViolations },
      });
    }
  }

  /**
   * Perform on-demand security scan
   */
  async performSecurityScan(config?: Partial<ScanConfig>): Promise<SecurityScanResult> {
    if (!this.config.enableSecurityScanning) {
      throw new Error('Security scanning is disabled');
    }

    const scanResult = await this.securityScanner.performSecurityScan(config);
    this.checkForAlerts(scanResult);
    
    return scanResult;
  }

  /**
   * Check for alerts based on scan results
   */
  private checkForAlerts(scanResult: SecurityScanResult): void {
    const { summary } = scanResult;
    const thresholds = this.config.alertThresholds;

    if (summary.critical >= thresholds.criticalVulnerabilities) {
      this.createAlert({
        type: 'VULNERABILITY',
        severity: 'CRITICAL',
        title: 'Critical Vulnerabilities Detected',
        description: `${summary.critical} critical vulnerabilities found during security scan`,
        metadata: { scanResult, threshold: thresholds.criticalVulnerabilities },
      });
    }

    if (summary.high >= thresholds.highVulnerabilities) {
      this.createAlert({
        type: 'VULNERABILITY',
        severity: 'HIGH',
        title: 'High-Severity Vulnerabilities Detected',
        description: `${summary.high} high-severity vulnerabilities found during security scan`,
        metadata: { scanResult, threshold: thresholds.highVulnerabilities },
      });
    }
  }

  /**
   * Create security alert
   */
  private createAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'resolved'>): void {
    const alert: SecurityAlert = {
      id: require('crypto').randomUUID(),
      timestamp: new Date(),
      resolved: false,
      ...alertData,
    };

    this.alerts.push(alert);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    this.logger.warn(`Security alert created: ${alert.title} (${alert.severity})`);
  }

  /**
   * Get security dashboard data
   */
  getSecurityDashboard(): SecurityDashboard {
    const latestScan = this.securityScanner.getLatestScan();
    const securityReport = this.securityScanner.generateSecurityReport();
    const cspAnalytics = this.cspManager.getAnalytics();
    const securityHeaderConfigs = this.securityHeaders.getSecurityHeaders();

    const dashboard: SecurityDashboard = {
      overallScore: securityReport.overallScore,
      lastScanDate: latestScan?.scanDate || new Date(),
      vulnerabilitySummary: latestScan?.summary || {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      cspAnalytics,
      securityHeaders: {
        enabled: securityHeaderConfigs.filter(h => h.enabled).length,
        total: securityHeaderConfigs.length,
        compliance: (securityHeaderConfigs.filter(h => h.enabled).length / securityHeaderConfigs.length) * 100,
      },
      recentAlerts: this.alerts.filter(a => !a.resolved).slice(-10),
      trends: {
        vulnerabilityTrend: securityReport.trends.vulnerabilityCount,
        securityScoreTrend: [securityReport.overallScore], // Simplified - would include historical data
        cspViolationTrend: [cspAnalytics.totalViolations], // Simplified - would include historical data
      },
    };

    return dashboard;
  }

  /**
   * Get security alerts
   */
  getAlerts(resolved?: boolean, limit?: number): SecurityAlert[] {
    let alerts = [...this.alerts];
    
    if (resolved !== undefined) {
      alerts = alerts.filter(alert => alert.resolved === resolved);
    }
    
    if (limit) {
      alerts = alerts.slice(-limit);
    }
    
    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.logger.log(`Alert resolved: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Get security scan history
   */
  getScanHistory(limit?: number): SecurityScanResult[] {
    return this.securityScanner.getScanHistory(limit);
  }

  /**
   * Get CSP violation reports
   */
  getCSPViolationReports(limit?: number): CSPViolationReport[] {
    return this.cspManager.getViolationReports(limit);
  }

  /**
   * Get CSP analytics
   */
  getCSPAnalytics(): CSPAnalytics {
    return this.cspManager.getAnalytics();
  }

  /**
   * Get security recommendations
   */
  getSecurityRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // Get recommendations from security scanner
    const securityReport = this.securityScanner.generateSecurityReport();
    recommendations.push(...securityReport.recommendations);
    
    // Get recommendations from CSP manager
    const cspRecommendations = this.cspManager.getRecommendations();
    recommendations.push(...cspRecommendations);
    
    // Environment-specific recommendations
    if (this.config.environment === 'production') {
      recommendations.push('Ensure all security headers are properly configured for production');
      recommendations.push('Enable CSP reporting and monitor violations regularly');
      recommendations.push('Schedule daily security scans and review results');
    }
    
    return recommendations;
  }

  /**
   * Update security configuration
   */
  updateConfig(updates: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Restart scheduled scans if configuration changed
    if (updates.scanSchedule || updates.enableSecurityScanning) {
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }
      
      if (this.config.enableSecurityScanning) {
        this.setupScheduledScans();
      }
    }
    
    this.logger.log('Security configuration updated');
  }

  /**
   * Get current security configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  /**
   * Export security data
   */
  exportSecurityData(): any {
    return {
      config: this.config,
      alerts: this.alerts,
      scanHistory: this.securityScanner.getScanHistory(),
      cspData: this.cspManager.exportData(),
      securityReport: this.securityScanner.generateSecurityReport(),
      exportDate: new Date(),
    };
  }

  /**
   * Import security data
   */
  importSecurityData(data: any): void {
    if (data.config) {
      this.config = { ...this.config, ...data.config };
    }
    
    if (data.alerts) {
      this.alerts = [...data.alerts];
    }
    
    if (data.cspData) {
      this.cspManager.importData(data.cspData);
    }
    
    this.logger.log('Security data imported successfully');
  }

  /**
   * Generate security report
   */
  generateSecurityReport(): SecurityReport {
    return this.securityScanner.generateSecurityReport();
  }

  /**
   * Validate security configuration
   */
  validateSecurityConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate security headers configuration
    const headerPolicy = this.securityHeaders.getCurrentPolicy();
    const headerValidation = this.securityHeaders.validatePolicy(headerPolicy);
    errors.push(...headerValidation.errors);

    // Validate CSP configuration
    const cspPolicy = this.config.environment === 'production' 
      ? this.cspManager.getProductionPolicy()
      : this.cspManager.getDefaultPolicy();
    const cspValidation = this.cspManager.validatePolicy(cspPolicy);
    errors.push(...cspValidation.errors);

    // Validate scan configuration
    if (this.config.enableSecurityScanning && !this.config.scanSchedule) {
      errors.push('Security scanning is enabled but no scan schedule is configured');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    this.logger.log('Security service shutdown completed');
  }
}
