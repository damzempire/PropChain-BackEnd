import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance, AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { validate as validateJsonSchema } from 'jsonschema';

export interface ContractDefinition {
  name: string;
  version: string;
  provider: {
    name: string;
    baseUrl: string;
  };
  consumer: {
    name: string;
  };
  interactions: ContractInteraction[];
}

export interface ContractInteraction {
  description: string;
  request: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: any;
    query?: Record<string, any>;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: any;
  };
  metadata?: {
    tags?: string[];
    priority?: 'high' | 'medium' | 'low';
  };
}

export interface ContractTestResult {
  interaction: ContractInteraction;
  passed: boolean;
  actualResponse?: AxiosResponse;
  errors: string[];
  duration: number;
}

export interface ContractTestSuite {
  contract: ContractDefinition;
  results: ContractTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
    successRate: number;
  };
}

export interface ContractVerificationOptions {
  timeout?: number;
  retries?: number;
  skipTlsVerification?: boolean;
  customHeaders?: Record<string, string>;
  allowExtraResponseFields?: boolean;
  strictHeaderMatching?: boolean;
}

@Injectable()
export class ContractTester {
  private readonly logger = new Logger(ContractTester.name);
  private readonly contractsDir = 'contracts';
  private readonly reportsDir = 'test-reports/contracts';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: AxiosInstance
  ) {}

  /**
   * Load contract definitions from files
   */
  async loadContracts(contractsPath?: string): Promise<ContractDefinition[]> {
    const contractsDirectory = contractsPath || this.contractsDir;
    this.logger.log(`Loading contracts from ${contractsDirectory}`);

    if (!fs.existsSync(contractsDirectory)) {
      this.logger.warn(`Contracts directory ${contractsDirectory} does not exist`);
      return [];
    }

    const contracts: ContractDefinition[] = [];
    const contractFiles = fs.readdirSync(contractsDirectory)
      .filter(file => file.endsWith('.json') || file.endsWith('.yaml'));

    for (const file of contractFiles) {
      try {
        const filePath = path.join(contractsDirectory, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const contract = file.endsWith('.json') 
          ? JSON.parse(content) 
          : this.parseYaml(content);
        
        contracts.push(contract);
        this.logger.log(`Loaded contract: ${contract.name}`);
      } catch (error) {
        this.logger.error(`Failed to load contract from ${file}:`, error);
      }
    }

    return contracts;
  }

  /**
   * Test a single contract against the provider
   */
  async testContract(
    contract: ContractDefinition,
    options: ContractVerificationOptions = {}
  ): Promise<ContractTestSuite> {
    this.logger.log(`Testing contract: ${contract.name}`);
    const startTime = Date.now();

    const results: ContractTestResult[] = [];
    
    for (const interaction of contract.interactions) {
      const result = await this.testInteraction(
        contract.provider.baseUrl,
        interaction,
        options
      );
      results.push(result);
    }

    const duration = Date.now() - startTime;
    const summary = this.calculateSummary(results, duration);

    const testSuite: ContractTestSuite = {
      contract,
      results,
      summary
    };

    await this.saveTestReport(testSuite);
    return testSuite;
  }

  /**
   * Test multiple contracts
   */
  async testContracts(
    contracts: ContractDefinition[],
    options: ContractVerificationOptions = {}
  ): Promise<ContractTestSuite[]> {
    this.logger.log(`Testing ${contracts.length} contracts`);
    
    const testSuites: ContractTestSuite[] = [];
    
    for (const contract of contracts) {
      const testSuite = await this.testContract(contract, options);
      testSuites.push(testSuite);
    }

    await this.saveCombinedReport(testSuites);
    return testSuites;
  }

  /**
   * Test a single interaction
   */
  async testInteraction(
    baseUrl: string,
    interaction: ContractInteraction,
    options: ContractVerificationOptions
  ): Promise<ContractTestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let actualResponse: AxiosResponse | undefined;
    let passed = false;

    try {
      // Build request URL
      const url = this.buildUrl(baseUrl, interaction.request.path, interaction.request.query);
      
      // Prepare request configuration
      const requestConfig = {
        method: interaction.request.method.toLowerCase(),
        url,
        headers: {
          ...interaction.request.headers,
          ...options.customHeaders
        },
        data: interaction.request.body,
        timeout: options.timeout || 30000,
        validateStatus: () => true // Don't throw on HTTP errors
      };

      // Execute request
      actualResponse = await this.httpClient.request(requestConfig);

      // Validate response
      const validationErrors = await this.validateResponse(
        interaction.response,
        actualResponse,
        options
      );

      if (validationErrors.length === 0) {
        passed = true;
      } else {
        errors.push(...validationErrors);
      }

    } catch (error) {
      errors.push(`Request failed: ${error.message}`);
    }

    const duration = Date.now() - startTime;

    const result: ContractTestResult = {
      interaction,
      passed,
      actualResponse,
      errors,
      duration
    };

    this.logInteractionResult(result);
    return result;
  }

  /**
   * Generate contract from OpenAPI specification
   */
  async generateContractFromOpenApi(
    openApiSpec: any,
    consumerName: string,
    providerName: string,
    providerBaseUrl: string
  ): Promise<ContractDefinition> {
    this.logger.log('Generating contract from OpenAPI specification');

    const interactions: ContractInteraction[] = [];
    const paths = openApiSpec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (this.isHttpMethod(method)) {
          const interaction = this.convertOpenApiOperationToInteraction(
            path,
            method.toUpperCase(),
            operation as any
          );
          interactions.push(interaction);
        }
      }
    }

    const contract: ContractDefinition = {
      name: `${consumerName}-${providerName}-contract`,
      version: '1.0.0',
      provider: {
        name: providerName,
        baseUrl: providerBaseUrl
      },
      consumer: {
        name: consumerName
      },
      interactions
    };

    return contract;
  }

  /**
   * Publish contract to contract registry
   */
  async publishContract(contract: ContractDefinition, registryUrl?: string): Promise<void> {
    this.logger.log(`Publishing contract: ${contract.name}`);
    
    const registry = registryUrl || this.configService.get<string>('CONTRACT_REGISTRY_URL');
    if (!registry) {
      throw new Error('Contract registry URL not configured');
    }

    try {
      await this.httpClient.post(`${registry}/contracts`, contract);
      this.logger.log(`Contract ${contract.name} published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish contract: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify contract against provider (pact-like verification)
   */
  async verifyContract(
    contractName: string,
    providerBaseUrl: string,
    options: ContractVerificationOptions = {}
  ): Promise<ContractTestSuite> {
    this.logger.log(`Verifying contract: ${contractName}`);
    
    // Load contract from registry or local file
    const contract = await this.loadContractByName(contractName);
    if (!contract) {
      throw new Error(`Contract not found: ${contractName}`);
    }

    // Update provider base URL for verification
    contract.provider.baseUrl = providerBaseUrl;

    return this.testContract(contract, options);
  }

  private buildUrl(baseUrl: string, path: string, query?: Record<string, any>): string {
    const url = new URL(path, baseUrl);
    
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    return url.toString();
  }

  private async validateResponse(
    expectedResponse: any,
    actualResponse: AxiosResponse,
    options: ContractVerificationOptions
  ): Promise<string[]> {
    const errors: string[] = [];

    // Validate status code
    if (expectedResponse.status !== actualResponse.status) {
      errors.push(`Status code mismatch: expected ${expectedResponse.status}, got ${actualResponse.status}`);
    }

    // Validate headers
    if (expectedResponse.headers) {
      const headerErrors = this.validateHeaders(
        expectedResponse.headers,
        actualResponse.headers,
        options.strictHeaderMatching
      );
      errors.push(...headerErrors);
    }

    // Validate body
    if (expectedResponse.body) {
      const bodyErrors = this.validateBody(
        expectedResponse.body,
        actualResponse.data,
        options.allowExtraResponseFields
      );
      errors.push(...bodyErrors);
    }

    return errors;
  }

  private validateHeaders(
    expectedHeaders: Record<string, string>,
    actualHeaders: any,
    strictMatching: boolean = false
  ): string[] {
    const errors: string[] = [];

    for (const [key, expectedValue] of Object.entries(expectedHeaders)) {
      const actualValue = actualHeaders[key.toLowerCase()];
      
      if (!actualValue) {
        errors.push(`Missing header: ${key}`);
      } else if (actualValue !== expectedValue) {
        errors.push(`Header ${key} mismatch: expected "${expectedValue}", got "${actualValue}"`);
      }
    }

    if (strictMatching) {
      for (const key of Object.keys(actualHeaders)) {
        if (!expectedHeaders[key.toLowerCase()]) {
          errors.push(`Unexpected header: ${key}`);
        }
      }
    }

    return errors;
  }

  private validateBody(
    expectedBody: any,
    actualBody: any,
    allowExtraFields: boolean = true
  ): string[] {
    const errors: string[] = [];

    try {
      // Use JSON schema validation if expected body has a schema
      if (expectedBody.type === 'object' && expectedBody.properties) {
        const result = validateJsonSchema(actualBody, expectedBody);
        if (!result.valid) {
          errors.push(...result.errors.map((error: any) => error.message));
        }
      } else {
        // Deep comparison for non-schema bodies
        const comparisonErrors = this.compareObjects(expectedBody, actualBody, allowExtraFields);
        errors.push(...comparisonErrors);
      }
    } catch (error) {
      errors.push(`Body validation failed: ${error.message}`);
    }

    return errors;
  }

  private compareObjects(expected: any, actual: any, allowExtraFields: boolean): string[] {
    const errors: string[] = [];

    if (typeof expected !== typeof actual) {
      errors.push(`Type mismatch: expected ${typeof expected}, got ${typeof actual}`);
      return errors;
    }

    if (expected === null || actual === null) {
      if (expected !== actual) {
        errors.push(`Null mismatch: expected ${expected}, got ${actual}`);
      }
      return errors;
    }

    if (typeof expected === 'object') {
      const expectedKeys = Object.keys(expected);
      const actualKeys = Object.keys(actual);

      // Check required fields
      for (const key of expectedKeys) {
        if (!(key in actual)) {
          errors.push(`Missing field: ${key}`);
        } else {
          const nestedErrors = this.compareObjects(expected[key], actual[key], allowExtraFields);
          errors.push(...nestedErrors.map(err => `${key}.${err}`));
        }
      }

      // Check for extra fields
      if (!allowExtraFields) {
        for (const key of actualKeys) {
          if (!(key in expected)) {
            errors.push(`Unexpected field: ${key}`);
          }
        }
      }
    } else if (expected !== actual) {
      errors.push(`Value mismatch: expected ${expected}, got ${actual}`);
    }

    return errors;
  }

  private convertOpenApiOperationToInteraction(
    path: string,
    method: string,
    operation: any
  ): ContractInteraction {
    // Generate example request body from schema
    let requestBody: any;
    if (operation.requestBody && operation.requestBody.content) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent && jsonContent.schema) {
        requestBody = this.generateExampleFromSchema(jsonContent.schema);
      }
    }

    // Generate example response from schema
    let responseBody: any;
    if (operation.responses && operation.responses['200']) {
      const response200 = operation.responses['200'];
      if (response200.content && response200.content['application/json']) {
        const jsonContent = response200.content['application/json'];
        if (jsonContent && jsonContent.schema) {
          responseBody = this.generateExampleFromSchema(jsonContent.schema);
        }
      }
    }

    return {
      description: operation.summary || operation.description || `${method} ${path}`,
      request: {
        method,
        path,
        headers: this.extractHeaders(operation),
        body: requestBody,
        query: this.extractQueryParameters(operation)
      },
      response: {
        status: 200,
        headers: this.extractResponseHeaders(operation),
        body: responseBody
      },
      metadata: {
        tags: operation.tags,
        priority: 'medium'
      }
    };
  }

  private generateExampleFromSchema(schema: any): any {
    // Simple example generation - could be enhanced with faker
    switch (schema.type) {
      case 'string':
        return schema.enum ? schema.enum[0] : 'example';
      case 'number':
      case 'integer':
        return schema.minimum || 0;
      case 'boolean':
        return true;
      case 'array':
        return schema.items ? [this.generateExampleFromSchema(schema.items)] : [];
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          for (const [key, value] of Object.entries(schema.properties)) {
            obj[key] = this.generateExampleFromSchema(value);
          }
        }
        return obj;
      default:
        return null;
    }
  }

  private extractHeaders(operation: any): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'header') {
          headers[param.name] = param.example || 'example-value';
        }
      }
    }

    return headers;
  }

  private extractResponseHeaders(operation: any): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (operation.responses && operation.responses['200']) {
      const response200 = operation.responses['200'];
      if (response200.headers) {
        for (const [key, value] of Object.entries(response200.headers)) {
          headers[key] = (value as any).example || 'example-value';
        }
      }
    }

    return headers;
  }

  private extractQueryParameters(operation: any): Record<string, any> {
    const query: Record<string, any> = {};
    
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'query') {
          query[param.name] = param.example || 'example-value';
        }
      }
    }

    return query;
  }

  private calculateSummary(results: ContractTestResult[], duration: number) {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const successRate = total > 0 ? (passed / total) * 100 : 0;

    return {
      total,
      passed,
      failed,
      duration,
      successRate
    };
  }

  private logInteractionResult(result: ContractTestResult): void {
    const status = result.passed ? '✅' : '❌';
    this.logger.log(
      `${status} ${result.interaction.request.method} ${result.interaction.request.path} - ${result.duration}ms`
    );
    
    if (!result.passed) {
      for (const error of result.errors) {
        this.logger.error(`  - ${error}`);
      }
    }
  }

  private async saveTestReport(testSuite: ContractTestSuite): Promise<void> {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const reportPath = path.join(this.reportsDir, `${testSuite.contract.name}-report.json`);
    fs.writeFileSync(reportPath, JSON.stringify(testSuite, null, 2));
    
    this.logger.log(`Test report saved to ${reportPath}`);
  }

  private async saveCombinedReport(testSuites: ContractTestSuite[]): Promise<void> {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const combinedReport = {
      timestamp: new Date().toISOString(),
      contracts: testSuites.map(suite => ({
        name: suite.contract.name,
        version: suite.contract.version,
        summary: suite.summary
      })),
      overall: {
        totalContracts: testSuites.length,
        totalTests: testSuites.reduce((sum, suite) => sum + suite.summary.total, 0),
        totalPassed: testSuites.reduce((sum, suite) => sum + suite.summary.passed, 0),
        totalFailed: testSuites.reduce((sum, suite) => sum + suite.summary.failed, 0),
        overallSuccessRate: testSuites.reduce((sum, suite) => sum + suite.summary.successRate, 0) / testSuites.length
      }
    };

    const reportPath = path.join(this.reportsDir, 'combined-contract-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(combinedReport, null, 2));
    
    this.logger.log(`Combined report saved to ${reportPath}`);
  }

  private async loadContractByName(contractName: string): Promise<ContractDefinition | null> {
    const contracts = await this.loadContracts();
    return contracts.find(c => c.name === contractName) || null;
  }

  private isHttpMethod(method: string): boolean {
    return ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method);
  }

  private parseYaml(content: string): any {
    // Simple YAML parser - in production, use a proper YAML library
    const lines = content.split('\n');
    const result: any = {};
    let currentSection: any = result;
    const sectionStack: any[] = [result];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.length - line.trimStart().length;
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (value) {
        currentSection[key.trim()] = this.parseValue(value);
      } else {
        currentSection[key.trim()] = {};
        sectionStack.push(currentSection[key.trim()]);
        currentSection = currentSection[key.trim()];
      }
    }

    return result;
  }

  private parseValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
    return value;
  }
}
