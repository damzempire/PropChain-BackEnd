import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface SecurityVulnerability {
  id: string;
  type: 'XSS' | 'SQL_INJECTION' | 'CSRF' | 'INSECURE_HEADERS' | 'WEAK_CRYPTO' | 'DEPENDENCY' | 'MISCONFIGURATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  file?: string;
  line?: number;
  recommendation: string;
  cve?: string;
  cvssScore?: number;
  discoveredAt: Date;
}

export interface SecurityScanResult {
  id: string;
  scanDate: Date;
  scanType: 'FULL' | 'QUICK' | 'DEPENDENCIES' | 'CODE';
  vulnerabilities: SecurityVulnerability[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scanDuration: number;
  passed: boolean;
}

export interface SecurityReport {
  scanResults: SecurityScanResult[];
  overallScore: number;
  trends: {
    vulnerabilityCount: number[];
    severityDistribution: Record<string, number>;
    scanFrequency: number;
  };
  recommendations: string[];
  lastScanDate: Date;
}

export interface ScanConfig {
  includeDependencies: boolean;
  includeCodeAnalysis: boolean;
  includeHeaderAnalysis: boolean;
  includeConfigAnalysis: boolean;
  excludePaths: string[];
  severityThreshold: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  maxScanDuration: number; // in minutes
}

@Injectable()
export class SecurityScanner {
  private readonly logger = new Logger(SecurityScanner.name);
  private scanHistory: SecurityScanResult[] = [];
  private currentScan: SecurityScanResult | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Perform comprehensive security scan
   */
  async performSecurityScan(config?: Partial<ScanConfig>): Promise<SecurityScanResult> {
    const scanConfig: ScanConfig = {
      includeDependencies: true,
      includeCodeAnalysis: true,
      includeHeaderAnalysis: true,
      includeConfigAnalysis: true,
      excludePaths: ['node_modules', 'dist', '.git', 'coverage'],
      severityThreshold: 'LOW',
      maxScanDuration: 30,
      ...config,
    };

    const scanId = crypto.randomUUID();
    const startTime = Date.now();

    this.logger.log(`Starting security scan: ${scanId}`);

    const scanResult: SecurityScanResult = {
      id: scanId,
      scanDate: new Date(),
      scanType: 'FULL',
      vulnerabilities: [],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      scanDuration: 0,
      passed: true,
    };

    this.currentScan = scanResult;

    try {
      // Dependency vulnerability scan
      if (scanConfig.includeDependencies) {
        await this.scanDependencies(scanResult);
      }

      // Code analysis scan
      if (scanConfig.includeCodeAnalysis) {
        await this.scanCode(scanResult, scanConfig);
      }

      // Security headers analysis
      if (scanConfig.includeHeaderAnalysis) {
        await this.scanSecurityHeaders(scanResult);
      }

      // Configuration analysis
      if (scanConfig.includeConfigAnalysis) {
        await this.scanConfiguration(scanResult);
      }

      // Calculate summary
      this.calculateSummary(scanResult);

      // Determine if scan passed
      scanResult.passed = this.determineScanResult(scanResult, scanConfig.severityThreshold);

      const scanDuration = Date.now() - startTime;
      scanResult.scanDuration = scanDuration;

      // Store scan result
      this.scanHistory.push(scanResult);
      
      // Keep only last 50 scans
      if (this.scanHistory.length > 50) {
        this.scanHistory = this.scanHistory.slice(-50);
      }

      this.logger.log(`Security scan completed: ${scanId} (${scanDuration}ms) - ${scanResult.summary.total} vulnerabilities found`);

      return scanResult;

    } catch (error: any) {
      this.logger.error(`Security scan failed: ${error.message}`);
      scanResult.passed = false;
      scanResult.scanDuration = Date.now() - startTime;
      return scanResult;
    } finally {
      this.currentScan = null;
    }
  }

  /**
   * Scan for dependency vulnerabilities
   */
  private async scanDependencies(scanResult: SecurityScanResult): Promise<void> {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check for known vulnerable packages (simplified version)
      const vulnerablePackages = this.getKnownVulnerablePackages();

      for (const [packageName, version] of Object.entries(dependencies)) {
        const vulnerability = vulnerablePackages[packageName];
        if (vulnerability && this.isVersionVulnerable(version as string, vulnerability.affectedVersions)) {
          scanResult.vulnerabilities.push({
            id: crypto.randomUUID(),
            type: 'DEPENDENCY',
            severity: vulnerability.severity,
            title: `Vulnerable dependency: ${packageName}`,
            description: `Package ${packageName}@${version} has known security vulnerabilities`,
            recommendation: `Update ${packageName} to a safe version`,
            cve: vulnerability.cve,
            cvssScore: vulnerability.cvssScore,
            discoveredAt: new Date(),
          });
        }
      }

    } catch (error: any) {
      this.logger.error(`Dependency scan failed: ${error.message}`);
    }
  }

  /**
   * Scan code for security issues
   */
  private async scanCode(scanResult: SecurityScanResult, config: ScanConfig): Promise<void> {
    try {
      const srcPath = path.join(process.cwd(), 'src');
      if (!fs.existsSync(srcPath)) {
        return;
      }

      await this.scanDirectory(srcPath, scanResult, config);

    } catch (error: any) {
      this.logger.error(`Code scan failed: ${error.message}`);
    }
  }

  /**
   * Scan directory recursively
   */
  private async scanDirectory(dirPath: string, scanResult: SecurityScanResult, config: ScanConfig): Promise<void> {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);

      // Skip excluded paths
      if (config.excludePaths.some(excluded => itemPath.includes(excluded))) {
        continue;
      }

      if (stat.isDirectory()) {
        await this.scanDirectory(itemPath, scanResult, config);
      } else if (stat.isFile() && item.endsWith('.ts')) {
        await this.scanFile(itemPath, scanResult);
      }
    }
  }

  /**
   * Scan individual file for security issues
   */
  private async scanFile(filePath: string, scanResult: SecurityScanResult): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        // Check for potential security issues
        const issues = this.analyzeLine(line, filePath, lineNumber);
        scanResult.vulnerabilities.push(...issues);
      }

    } catch (error: any) {
      this.logger.error(`Failed to scan file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Analyze line for security issues
   */
  private analyzeLine(line: string, filePath: string, lineNumber: number): SecurityVulnerability[] {
    const vulnerabilities: SecurityVulnerability[] = [];

    // Check for eval() usage
    if (line.includes('eval(')) {
      vulnerabilities.push({
        id: crypto.randomUUID(),
        type: 'XSS',
        severity: 'HIGH',
        title: 'Use of eval() function',
        description: 'eval() can execute arbitrary code and is a security risk',
        file: filePath,
        line: lineNumber,
        recommendation: 'Replace eval() with safer alternatives',
        discoveredAt: new Date(),
      });
    }

    // Check for hardcoded secrets
    const secretPatterns = [
      /password\s*=\s*['"][^'"]+['"]/i,
      /api_key\s*=\s*['"][^'"]+['"]/i,
      /secret\s*=\s*['"][^'"]+['"]/i,
      /token\s*=\s*['"][^'"]+['"]/i,
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(line)) {
        vulnerabilities.push({
          id: crypto.randomUUID(),
          type: 'MISCONFIGURATION',
          severity: 'CRITICAL',
          title: 'Hardcoded secret detected',
          description: 'Hardcoded secrets in code are a security risk',
          file: filePath,
          line: lineNumber,
          recommendation: 'Use environment variables or secure configuration management',
          discoveredAt: new Date(),
        });
        break;
      }
    }

    // Check for SQL injection patterns
    if (line.includes('SELECT') && line.includes('+') && (line.includes('req.') || line.includes('params.'))) {
      vulnerabilities.push({
        id: crypto.randomUUID(),
        type: 'SQL_INJECTION',
        severity: 'HIGH',
        title: 'Potential SQL injection',
        description: 'Direct string concatenation in SQL queries can lead to injection attacks',
        file: filePath,
        line: lineNumber,
        recommendation: 'Use parameterized queries or ORM',
        discoveredAt: new Date(),
      });
    }

    // Check for weak crypto
    if (line.includes('md5(') || line.includes('sha1(')) {
      vulnerabilities.push({
        id: crypto.randomUUID(),
        type: 'WEAK_CRYPTO',
        severity: 'MEDIUM',
        title: 'Weak cryptographic algorithm',
        description: 'MD5 and SHA1 are considered weak cryptographic algorithms',
        file: filePath,
        line: lineNumber,
        recommendation: 'Use stronger algorithms like SHA-256 or bcrypt',
        discoveredAt: new Date(),
      });
    }

    return vulnerabilities;
  }

  /**
   * Scan security headers
   */
  private async scanSecurityHeaders(scanResult: SecurityScanResult): Promise<void> {
    try {
      // This would typically check the actual HTTP headers
      // For now, we'll check configuration files
      const appModulePath = path.join(process.cwd(), 'src', 'app.module.ts');
      
      if (fs.existsSync(appModulePath)) {
        const content = fs.readFileSync(appModulePath, 'utf8');
        
        // Check for missing security headers
        if (!content.includes('helmet')) {
          scanResult.vulnerabilities.push({
            id: crypto.randomUUID(),
            type: 'INSECURE_HEADERS',
            severity: 'MEDIUM',
            title: 'Missing security headers',
            description: 'Application may be missing important security headers',
            recommendation: 'Implement helmet middleware or configure security headers',
            discoveredAt: new Date(),
          });
        }
      }

    } catch (error: any) {
      this.logger.error(`Security headers scan failed: ${error.message}`);
    }
  }

  /**
   * Scan configuration files
   */
  private async scanConfiguration(scanResult: SecurityScanResult): Promise<void> {
    try {
      const configFiles = [
        '.env.example',
        'docker-compose.yml',
        'Dockerfile',
      ];

      for (const configFile of configFiles) {
        const configPath = path.join(process.cwd(), configFile);
        
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          
          // Check for insecure configurations
          if (configFile === 'docker-compose.yml' && content.includes('privileged: true')) {
            scanResult.vulnerabilities.push({
              id: crypto.randomUUID(),
              type: 'MISCONFIGURATION',
              severity: 'HIGH',
              title: 'Privileged Docker container',
              description: 'Running containers with privileged mode is a security risk',
              file: configFile,
              recommendation: 'Remove privileged mode unless absolutely necessary',
              discoveredAt: new Date(),
            });
          }

          if (configFile === '.env.example' && content.includes('password=') || content.includes('secret=')) {
            scanResult.vulnerabilities.push({
              id: crypto.randomUUID(),
              type: 'MISCONFIGURATION',
              severity: 'MEDIUM',
              title: 'Insecure environment variable example',
              description: 'Environment file example contains default passwords or secrets',
              file: configFile,
              recommendation: 'Remove default secrets from environment examples',
              discoveredAt: new Date(),
            });
          }
        }
      }

    } catch (error: any) {
      this.logger.error(`Configuration scan failed: ${error.message}`);
    }
  }

  /**
   * Calculate scan summary
   */
  private calculateSummary(scanResult: SecurityScanResult): void {
    const summary = scanResult.summary;
    
    for (const vulnerability of scanResult.vulnerabilities) {
      summary.total++;
      
      switch (vulnerability.severity) {
        case 'CRITICAL':
          summary.critical++;
          break;
        case 'HIGH':
          summary.high++;
          break;
        case 'MEDIUM':
          summary.medium++;
          break;
        case 'LOW':
          summary.low++;
          break;
      }
    }
  }

  /**
   * Determine if scan passed based on severity threshold
   */
  private determineScanResult(scanResult: SecurityScanResult, threshold: string): boolean {
    const severityLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const thresholdIndex = severityLevels.indexOf(threshold);
    
    for (const vulnerability of scanResult.vulnerabilities) {
      const severityIndex = severityLevels.indexOf(vulnerability.severity);
      if (severityIndex >= thresholdIndex) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get known vulnerable packages (simplified database)
   */
  private getKnownVulnerablePackages(): Record<string, any> {
    return {
      'lodash': {
        severity: 'HIGH',
        cve: 'CVE-2021-23337',
        cvssScore: 7.5,
        affectedVersions: '<4.17.21',
      },
      'axios': {
        severity: 'MEDIUM',
        cve: 'CVE-2021-3749',
        cvssScore: 5.3,
        affectedVersions: '<0.21.1',
      },
      'node-forge': {
        severity: 'HIGH',
        cve: 'CVE-2022-24772',
        cvssScore: 7.5,
        affectedVersions: '<1.3.0',
      },
    };
  }

  /**
   * Check if version is vulnerable
   */
  private isVersionVulnerable(version: string, affectedVersions: string): boolean {
    // Simplified version comparison
    // In a real implementation, you'd use a proper version comparison library
    return affectedVersions.includes('<') && version.startsWith('0.');
  }

  /**
   * Get scan history
   */
  getScanHistory(limit?: number): SecurityScanResult[] {
    if (limit) {
      return this.scanHistory.slice(-limit);
    }
    return [...this.scanHistory];
  }

  /**
   * Get latest scan result
   */
  getLatestScan(): SecurityScanResult | null {
    return this.scanHistory.length > 0 ? this.scanHistory[this.scanHistory.length - 1] : null;
  }

  /**
   * Get current scan status
   */
  getCurrentScan(): SecurityScanResult | null {
    return this.currentScan;
  }

  /**
   * Generate security report
   */
  generateSecurityReport(): SecurityReport {
    const scanResults = [...this.scanHistory];
    const latestScan = this.getLatestScan();

    const report: SecurityReport = {
      scanResults,
      overallScore: this.calculateSecurityScore(),
      trends: this.calculateTrends(),
      recommendations: this.generateRecommendations(),
      lastScanDate: latestScan?.scanDate || new Date(),
    };

    return report;
  }

  /**
   * Calculate overall security score
   */
  private calculateSecurityScore(): number {
    if (this.scanHistory.length === 0) {
      return 100;
    }

    const latestScan = this.getLatestScan();
    if (!latestScan) {
      return 100;
    }

    const { summary } = latestScan;
    const totalVulnerabilities = summary.total;
    
    // Simple scoring algorithm
    let score = 100;
    score -= summary.critical * 25;
    score -= summary.high * 15;
    score -= summary.medium * 8;
    score -= summary.low * 3;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate security trends
   */
  private calculateTrends(): SecurityReport['trends'] {
    const vulnerabilityCount = this.scanHistory.map(scan => scan.summary.total);
    const severityDistribution = this.getSeverityDistribution();
    const scanFrequency = this.calculateScanFrequency();

    return {
      vulnerabilityCount,
      severityDistribution,
      scanFrequency,
    };
  }

  /**
   * Get severity distribution
   */
  private getSeverityDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    for (const scan of this.scanHistory) {
      distribution.CRITICAL += scan.summary.critical;
      distribution.HIGH += scan.summary.high;
      distribution.MEDIUM += scan.summary.medium;
      distribution.LOW += scan.summary.low;
    }

    return distribution;
  }

  /**
   * Calculate scan frequency
   */
  private calculateScanFrequency(): number {
    if (this.scanHistory.length < 2) {
      return 0;
    }

    const latestScan = this.scanHistory[this.scanHistory.length - 1];
    const previousScan = this.scanHistory[this.scanHistory.length - 2];
    
    const timeDiff = latestScan.scanDate.getTime() - previousScan.scanDate.getTime();
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    
    return daysDiff > 0 ? Math.round(1 / daysDiff) : 0;
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const latestScan = this.getLatestScan();

    if (!latestScan) {
      return ['Perform an initial security scan to identify vulnerabilities'];
    }

    const { summary } = latestScan;

    if (summary.critical > 0) {
      recommendations.push(`Address ${summary.critical} critical vulnerabilities immediately`);
    }

    if (summary.high > 0) {
      recommendations.push(`Prioritize fixing ${summary.high} high-severity vulnerabilities`);
    }

    if (summary.medium > 5) {
      recommendations.push('Consider implementing automated dependency updates to reduce medium-risk vulnerabilities');
    }

    if (latestScan.scanDuration > 30000) {
      recommendations.push('Optimize scan configuration for faster execution');
    }

    if (this.scanHistory.length < 4) {
      recommendations.push('Schedule regular security scans (at least weekly)');
    }

    return recommendations;
  }

  /**
   * Export scan data
   */
  exportScanData(): any {
    return {
      scanHistory: this.scanHistory,
      exportDate: new Date(),
    };
  }

  /**
   * Clear scan history
   */
  clearScanHistory(): void {
    this.scanHistory = [];
    this.logger.log('Security scan history cleared');
  }
}
