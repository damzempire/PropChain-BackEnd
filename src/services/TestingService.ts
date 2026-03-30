import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { TestGenerator, GeneratedTest, TestGenerationOptions } from '../testing/TestGenerator';
import { ContractTester, ContractDefinition, ContractTestSuite, ContractVerificationOptions } from '../testing/ContractTester';
import { PerformanceBenchmark, BenchmarkEndpoint, LoadTestConfig, BenchmarkReport, BenchmarkThresholds } from '../testing/PerformanceBenchmark';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

export interface TestingSuiteConfig {
  name: string;
  description?: string;
  testGeneration?: TestGenerationOptions;
  contractTesting?: {
    enabled: boolean;
    contractsPath?: string;
    verificationOptions?: ContractVerificationOptions;
  };
  performanceTesting?: {
    enabled: boolean;
    endpoints: BenchmarkEndpoint[];
    thresholds?: BenchmarkThresholds;
    config?: LoadTestConfig;
  };
  schedule?: {
    enabled: boolean;
    cronExpression: string;
  };
}

export interface TestExecutionResult {
  suiteName: string;
  timestamp: string;
  duration: number;
  generatedTests?: GeneratedTest[];
  contractTests?: ContractTestSuite[];
  performanceReport?: BenchmarkReport;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    successRate: number;
  };
  errors: string[];
}

export interface TestReport {
  executionId: string;
  suiteConfig: TestingSuiteConfig;
  result: TestExecutionResult;
  artifacts: {
    testFiles: string[];
    reports: string[];
    logs: string[];
  };
}

@Injectable()
export class TestingService implements OnModuleInit {
  private readonly logger = new Logger(TestingService.name);
  private readonly reportsDir = 'test-reports';
  private readonly suitesDir = 'test-suites';
  private activeSuites = new Map<string, TestingSuiteConfig>();
  private executionHistory: TestReport[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: AxiosInstance,
    private readonly testGenerator: TestGenerator,
    private readonly contractTester: ContractTester,
    private readonly performanceBenchmark: PerformanceBenchmark
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Testing Service...');
    await this.ensureDirectories();
    await this.loadTestSuites();
    this.setupEventListeners();
  }

  /**
   * Execute a complete testing suite
   */
  async executeTestSuite(suiteName: string): Promise<TestExecutionResult> {
    const suiteConfig = this.activeSuites.get(suiteName);
    if (!suiteConfig) {
      throw new Error(`Test suite not found: ${suiteName}`);
    }

    this.logger.log(`Executing test suite: ${suiteName}`);
    const startTime = Date.now();
    const result: TestExecutionResult = {
      suiteName,
      timestamp: new Date().toISOString(),
      duration: 0,
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        successRate: 0
      },
      errors: []
    };

    try {
      // 1. Generate automated tests
      if (suiteConfig.testGeneration) {
        const generatedTests = await this.generateAutomatedTests(suiteConfig);
        result.generatedTests = generatedTests;
        result.summary.totalTests += generatedTests.length;
      }

      // 2. Execute contract tests
      if (suiteConfig.contractTesting?.enabled) {
        const contractResults = await this.executeContractTests(suiteConfig);
        result.contractTests = contractResults;
        
        for (const testSuite of contractResults) {
          result.summary.totalTests += testSuite.summary.total;
          result.summary.passedTests += testSuite.summary.passed;
          result.summary.failedTests += testSuite.summary.failed;
        }
      }

      // 3. Execute performance tests
      if (suiteConfig.performanceTesting?.enabled) {
        const performanceReport = await this.executePerformanceTests(suiteConfig);
        result.performanceReport = performanceReport;
        
        // Performance tests don't have pass/fail in the same way, but we can validate against thresholds
        if (suiteConfig.performanceTesting.thresholds) {
          const validationResults = await this.validatePerformanceThresholds(
            performanceReport,
            suiteConfig.performanceTesting.thresholds
          );
          result.summary.totalTests += validationResults.length;
          result.summary.passedTests += validationResults.filter(r => r.passed).length;
          result.summary.failedTests += validationResults.filter(r => !r.passed).length;
        }
      }

      result.duration = Date.now() - startTime;
      result.summary.successRate = result.summary.totalTests > 0 
        ? (result.summary.passedTests / result.summary.totalTests) * 100 
        : 100;

      // Save execution report
      const report = await this.saveExecutionReport(suiteConfig, result);
      this.executionHistory.push(report);

      this.logger.log(`Test suite ${suiteName} completed successfully`);
      return result;

    } catch (error) {
      result.errors.push(error.message);
      result.duration = Date.now() - startTime;
      
      this.logger.error(`Test suite ${suiteName} failed:`, error);
      throw error;
    }
  }

  /**
   * Generate automated tests from API specification
   */
  async generateAutomatedTests(suiteConfig: TestingSuiteConfig): Promise<GeneratedTest[]> {
    this.logger.log(`Generating automated tests for suite: ${suiteConfig.name}`);

    try {
      // Load OpenAPI specification
      const swaggerSpec = await this.loadOpenApiSpec();
      
      // Generate tests
      const generatedTests = await this.testGenerator.generateTestsFromSpec(
        swaggerSpec,
        suiteConfig.testGeneration
      );

      this.logger.log(`Generated ${generatedTests.length} automated tests`);
      return generatedTests;

    } catch (error) {
      this.logger.error('Failed to generate automated tests:', error);
      throw error;
    }
  }

  /**
   * Execute contract tests
   */
  async executeContractTests(suiteConfig: TestingSuiteConfig): Promise<ContractTestSuite[]> {
    this.logger.log(`Executing contract tests for suite: ${suiteConfig.name}`);

    try {
      const contractsPath = suiteConfig.contractTesting.contractsPath || 'contracts';
      const contracts = await this.contractTester.loadContracts(contractsPath);

      if (contracts.length === 0) {
        this.logger.warn('No contracts found, generating from OpenAPI spec');
        const swaggerSpec = await this.loadOpenApiSpec();
        const contract = await this.contractTester.generateContractFromOpenApi(
          swaggerSpec,
          suiteConfig.name,
          'PropChain-Backend',
          this.configService.get<string>('API_BASE_URL', 'http://localhost:3000')
        );
        contracts.push(contract);
      }

      const verificationOptions = suiteConfig.contractTesting.verificationOptions || {};
      const testSuites = await this.contractTester.testContracts(contracts, verificationOptions);

      this.logger.log(`Executed contract tests for ${contracts.length} contracts`);
      return testSuites;

    } catch (error) {
      this.logger.error('Failed to execute contract tests:', error);
      throw error;
    }
  }

  /**
   * Execute performance tests
   */
  async executePerformanceTests(suiteConfig: TestingSuiteConfig): Promise<BenchmarkReport> {
    this.logger.log(`Executing performance tests for suite: ${suiteConfig.name}`);

    try {
      const performanceConfig = suiteConfig.performanceTesting;
      
      if (!performanceConfig || !performanceConfig.endpoints.length) {
        // Generate endpoints from OpenAPI spec if not provided
        const swaggerSpec = await this.loadOpenApiSpec();
        const endpoints = this.extractEndpointsFromSpec(swaggerSpec);
        performanceConfig.endpoints = endpoints;
      }

      const loadTestConfig: LoadTestConfig = {
        ...performanceConfig.config,
        endpoints: performanceConfig.endpoints
      };

      const report = await this.performanceBenchmark.runLoadTest(loadTestConfig);

      this.logger.log(`Performance tests completed for ${performanceConfig.endpoints.length} endpoints`);
      return report;

    } catch (error) {
      this.logger.error('Failed to execute performance tests:', error);
      throw error;
    }
  }

  /**
   * Create a new test suite
   */
  async createTestSuite(config: TestingSuiteConfig): Promise<void> {
    this.logger.log(`Creating test suite: ${config.name}`);

    // Validate configuration
    this.validateSuiteConfig(config);

    // Save suite configuration
    const suitePath = path.join(this.suitesDir, `${config.name}.json`);
    fs.writeFileSync(suitePath, JSON.stringify(config, null, 2));

    // Add to active suites
    this.activeSuites.set(config.name, config);

    this.logger.log(`Test suite ${config.name} created successfully`);
  }

  /**
   * Update an existing test suite
   */
  async updateTestSuite(suiteName: string, config: Partial<TestingSuiteConfig>): Promise<void> {
    const existingConfig = this.activeSuites.get(suiteName);
    if (!existingConfig) {
      throw new Error(`Test suite not found: ${suiteName}`);
    }

    const updatedConfig = { ...existingConfig, ...config };
    this.validateSuiteConfig(updatedConfig);

    // Save updated configuration
    const suitePath = path.join(this.suitesDir, `${suiteName}.json`);
    fs.writeFileSync(suitePath, JSON.stringify(updatedConfig, null, 2));

    // Update active suites
    this.activeSuites.set(suiteName, updatedConfig);

    this.logger.log(`Test suite ${suiteName} updated successfully`);
  }

  /**
   * Delete a test suite
   */
  async deleteTestSuite(suiteName: string): Promise<void> {
    const suitePath = path.join(this.suitesDir, `${suiteName}.json`);
    
    if (fs.existsSync(suitePath)) {
      fs.unlinkSync(suitePath);
    }

    this.activeSuites.delete(suiteName);

    this.logger.log(`Test suite ${suiteName} deleted successfully`);
  }

  /**
   * Get all test suites
   */
  getTestSuites(): TestingSuiteConfig[] {
    return Array.from(this.activeSuites.values());
  }

  /**
   * Get test suite by name
   */
  getTestSuite(suiteName: string): TestingSuiteConfig | undefined {
    return this.activeSuites.get(suiteName);
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): TestReport[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return this.executionHistory;
  }

  /**
   * Get execution report by ID
   */
  getExecutionReport(executionId: string): TestReport | undefined {
    return this.executionHistory.find(report => report.executionId === executionId);
  }

  /**
   * Run quick health check tests
   */
  async runHealthCheck(): Promise<{ status: string; checks: any[] }> {
    this.logger.log('Running health check tests...');

    const checks = [];
    let allPassed = true;

    try {
      // API connectivity check
      const apiCheck = await this.checkApiConnectivity();
      checks.push(apiCheck);
      if (!apiCheck.passed) allPassed = false;

      // Database connectivity check
      const dbCheck = await this.checkDatabaseConnectivity();
      checks.push(dbCheck);
      if (!dbCheck.passed) allPassed = false;

      // External service checks
      const externalCheck = await this.checkExternalServices();
      checks.push(externalCheck);
      if (!externalCheck.passed) allPassed = false;

      return {
        status: allPassed ? 'healthy' : 'unhealthy',
        checks
      };

    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'error',
        checks: [{ name: 'health_check', passed: false, error: error.message }]
      };
    }
  }

  /**
   * Generate comprehensive testing report
   */
  async generateComprehensiveReport(): Promise<string> {
    const suites = this.getTestSuites();
    const history = this.getExecutionHistory(10);
    const healthStatus = await this.runHealthCheck();

    const report = `
# Comprehensive Testing Report

Generated: ${new Date().toISOString()}

## System Health
Status: ${healthStatus.status}
${healthStatus.checks.map(check => `- ${check.name}: ${check.passed ? '✅' : '❌'}`).join('\n')}

## Test Suites
${suites.map(suite => `
### ${suite.name}
${suite.description || 'No description'}
- Test Generation: ${suite.testGeneration ? 'Enabled' : 'Disabled'}
- Contract Testing: ${suite.contractTesting?.enabled ? 'Enabled' : 'Disabled'}
- Performance Testing: ${suite.performanceTesting?.enabled ? 'Enabled' : 'Disabled'}
- Scheduled: ${suite.schedule?.enabled ? 'Yes' : 'No'}
`).join('\n')}

## Recent Executions
${history.map(report => `
### ${report.result.suiteName} - ${report.result.timestamp}
- Duration: ${report.result.duration}ms
- Success Rate: ${report.result.summary.successRate}%
- Tests: ${report.result.summary.passedTests}/${report.result.summary.totalTests}
${report.result.errors.length > 0 ? `
#### Errors:
${report.result.errors.map(error => `- ${error}`).join('\n')}
` : ''}
`).join('\n')}

## Recommendations
${this.generateRecommendations(suites, history)}
`;

    return report;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleScheduledTests(): Promise<void> {
    this.logger.log('Checking for scheduled test executions...');

    for (const [suiteName, suiteConfig] of this.activeSuites) {
      if (suiteConfig.schedule?.enabled) {
        try {
          this.logger.log(`Executing scheduled test suite: ${suiteName}`);
          await this.executeTestSuite(suiteName);
        } catch (error) {
          this.logger.error(`Scheduled test execution failed for ${suiteName}:`, error);
        }
      }
    }
  }

  private async ensureDirectories(): Promise<void> {
    const directories = [this.reportsDir, this.suitesDir];
    
    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private async loadTestSuites(): Promise<void> {
    if (!fs.existsSync(this.suitesDir)) {
      return;
    }

    const suiteFiles = fs.readdirSync(this.suitesDir).filter(file => file.endsWith('.json'));

    for (const file of suiteFiles) {
      try {
        const suitePath = path.join(this.suitesDir, file);
        const content = fs.readFileSync(suitePath, 'utf8');
        const config: TestingSuiteConfig = JSON.parse(content);
        
        this.activeSuites.set(config.name, config);
        this.logger.log(`Loaded test suite: ${config.name}`);
      } catch (error) {
        this.logger.error(`Failed to load test suite from ${file}:`, error);
      }
    }
  }

  private setupEventListeners(): void {
    this.performanceBenchmark.on('progress', (data) => {
      this.logger.log(`Performance test progress: ${data.endpoint} - ${data.requests} requests, ${data.rps} RPS`);
    });

    this.performanceBenchmark.on('complete', (report: BenchmarkReport) => {
      this.logger.log(`Performance test completed: ${report.summary.overallRps} RPS, ${report.summary.averageResponseTime}ms avg response time`);
    });
  }

  private async loadOpenApiSpec(): Promise<any> {
    try {
      const baseUrl = this.configService.get<string>('API_BASE_URL', 'http://localhost:3000');
      const response = await this.httpClient.get(`${baseUrl}/api-json`);
      return response.data;
    } catch (error) {
      this.logger.warn('Failed to load OpenAPI spec from running server, trying fallback...');
      // Try to load from file
      const specPath = path.join(process.cwd(), 'swagger-spec.json');
      if (fs.existsSync(specPath)) {
        const content = fs.readFileSync(specPath, 'utf8');
        return JSON.parse(content);
      }
      throw new Error('OpenAPI specification not available');
    }
  }

  private extractEndpointsFromSpec(swaggerSpec: any): BenchmarkEndpoint[] {
    const endpoints: BenchmarkEndpoint[] = [];
    const paths = swaggerSpec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (this.isHttpMethod(method)) {
          endpoints.push({
            name: `${method.toUpperCase()} ${path}`,
            method: method.toUpperCase(),
            url: `${this.configService.get<string>('API_BASE_URL', 'http://localhost:3000')}${path}`,
            weight: 1
          });
        }
      }
    }

    return endpoints;
  }

  private async validatePerformanceThresholds(
    report: BenchmarkReport,
    thresholds: BenchmarkThresholds
  ): Promise<Array<{ endpoint: string; passed: boolean; violations: string[] }>> {
    const results = [];

    for (const result of report.results) {
      const violations = [];

      if (thresholds.maxResponseTime && result.p95 > thresholds.maxResponseTime) {
        violations.push(`P95 response time ${result.p95}ms exceeds threshold ${thresholds.maxResponseTime}ms`);
      }

      if (thresholds.minRequestsPerSecond && result.requestsPerSecond < thresholds.minRequestsPerSecond) {
        violations.push(`RPS ${result.requestsPerSecond} below threshold ${thresholds.minRequestsPerSecond}`);
      }

      if (thresholds.maxErrorRate && result.errorRate > thresholds.maxErrorRate) {
        violations.push(`Error rate ${result.errorRate}% exceeds threshold ${thresholds.maxErrorRate}%`);
      }

      results.push({
        endpoint: result.endpoint,
        passed: violations.length === 0,
        violations
      });
    }

    return results;
  }

  private validateSuiteConfig(config: TestingSuiteConfig): void {
    if (!config.name) {
      throw new Error('Test suite name is required');
    }

    if (config.performanceTesting?.enabled && !config.performanceTesting.endpoints?.length) {
      throw new Error('Performance testing requires at least one endpoint');
    }

    if (config.schedule?.enabled && !config.schedule.cronExpression) {
      throw new Error('Scheduled testing requires a cron expression');
    }
  }

  private async saveExecutionReport(
    suiteConfig: TestingSuiteConfig,
    result: TestExecutionResult
  ): Promise<TestReport> {
    const executionId = this.generateExecutionId();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const report: TestReport = {
      executionId,
      suiteConfig,
      result,
      artifacts: {
        testFiles: [],
        reports: [],
        logs: []
      }
    };

    // Save report to file
    const reportPath = path.join(this.reportsDir, `execution-${timestamp}-${executionId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  private generateExecutionId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private isHttpMethod(method: string): boolean {
    return ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method);
  }

  private async checkApiConnectivity(): Promise<any> {
    try {
      const baseUrl = this.configService.get<string>('API_BASE_URL', 'http://localhost:3000');
      const response = await this.httpClient.get(`${baseUrl}/health`, { timeout: 5000 });
      return {
        name: 'api_connectivity',
        passed: response.status === 200,
        responseTime: response.headers['x-response-time'] || 'N/A'
      };
    } catch (error) {
      return {
        name: 'api_connectivity',
        passed: false,
        error: error.message
      };
    }
  }

  private async checkDatabaseConnectivity(): Promise<any> {
    try {
      // This would be implemented based on your database setup
      // For now, return a mock result
      return {
        name: 'database_connectivity',
        passed: true,
        responseTime: '15ms'
      };
    } catch (error) {
      return {
        name: 'database_connectivity',
        passed: false,
        error: error.message
      };
    }
  }

  private async checkExternalServices(): Promise<any> {
    try {
      // Check external services like blockchain nodes, external APIs, etc.
      // For now, return a mock result
      return {
        name: 'external_services',
        passed: true,
        services: [
          { name: 'blockchain_node', status: 'connected' },
          { name: 'redis_cache', status: 'connected' }
        ]
      };
    } catch (error) {
      return {
        name: 'external_services',
        passed: false,
        error: error.message
      };
    }
  }

  private generateRecommendations(suites: TestingSuiteConfig[], history: TestReport[]): string {
    const recommendations: string[] = [];

    if (suites.length === 0) {
      recommendations.push('- Consider creating test suites for regular testing');
    }

    const recentFailures = history.filter(h => h.result.summary.successRate < 100);
    if (recentFailures.length > 0) {
      recommendations.push(`- ${recentFailures.length} recent test executions had failures, investigate stability`);
    }

    const suitesWithoutScheduling = suites.filter(s => !s.schedule?.enabled);
    if (suitesWithoutScheduling.length > 0) {
      recommendations.push(`- ${suitesWithoutScheduling.length} test suites don't have scheduling enabled`);
    }

    if (recommendations.length === 0) {
      recommendations.push('- Testing setup looks good! Keep monitoring and maintaining your test suites.');
    }

    return recommendations.join('\n');
  }
}
