import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as crypto from 'crypto';

export interface TestRequest {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  body?: any;
  description?: string;
  tags?: string[];
}

export interface TestResponse {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  responseTime: number;
  timestamp: Date;
  error?: string;
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  requests: TestRequest[];
  environment?: Record<string, string>;
  setup?: TestRequest[];
  teardown?: TestRequest[];
}

export interface TestResult {
  suiteId: string;
  suiteName: string;
  totalRequests: number;
  passedRequests: number;
  failedRequests: number;
  totalResponseTime: number;
  averageResponseTime: number;
  results: TestResponse[];
  timestamp: Date;
}

@Injectable()
export class InteractiveTester {
  private readonly logger = new Logger(InteractiveTester.name);
  private testSuites: Map<string, TestSuite> = new Map();
  private testHistory: Map<string, TestResult[]> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Create a new test suite
   */
  createTestSuite(suite: Omit<TestSuite, 'id'>): string {
    const id = crypto.randomUUID();
    const testSuite: TestSuite = {
      id,
      requests: [],
      environment: {},
      setup: [],
      teardown: [],
      ...suite,
    };

    this.testSuites.set(id, testSuite);
    this.logger.log(`Created test suite: ${suite.name} (${id})`);
    return id;
  }

  /**
   * Add request to test suite
   */
  addRequestToSuite(suiteId: string, request: Omit<TestRequest, 'id'>): string {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteId}`);
    }

    const requestId = crypto.randomUUID();
    const testRequest: TestRequest = {
      id: requestId,
      ...request,
    };

    suite.requests.push(testRequest);
    this.logger.log(`Added request to suite ${suite.name}: ${request.method} ${request.url}`);
    return requestId;
  }

  /**
   * Execute a single test request
   */
  async executeRequest(request: TestRequest, environment?: Record<string, string>): Promise<TestResponse> {
    const startTime = Date.now();
    
    try {
      // Replace environment variables in URL
      let processedUrl = this.processTemplate(request.url, environment);
      
      // Replace environment variables in headers
      const processedHeaders = this.processHeaders(request.headers || {}, environment);
      
      // Replace environment variables in params
      const processedParams = this.processParams(request.params || {}, environment);
      
      // Replace environment variables in body
      const processedBody = request.body ? this.processTemplate(JSON.stringify(request.body), environment) : undefined;

      const config: AxiosRequestConfig = {
        method: request.method.toLowerCase() as any,
        url: processedUrl,
        headers: processedHeaders,
        params: processedParams,
        data: processedBody ? JSON.parse(processedBody) : undefined,
        timeout: 30000,
        validateStatus: () => true, // Don't throw on any status code
      };

      const response: AxiosResponse = await axios(config);
      const responseTime = Date.now() - startTime;

      const testResponse: TestResponse = {
        id: request.id,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        data: response.data,
        responseTime,
        timestamp: new Date(),
      };

      this.logger.log(`Request executed: ${request.method} ${request.url} - ${response.status} (${responseTime}ms)`);
      return testResponse;

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      const testResponse: TestResponse = {
        id: request.id,
        status: 0,
        statusText: 'Error',
        headers: {},
        data: null,
        responseTime,
        timestamp: new Date(),
        error: error.message,
      };

      this.logger.error(`Request failed: ${request.method} ${request.url} - ${error.message}`);
      return testResponse;
    }
  }

  /**
   * Execute a test suite
   */
  async executeTestSuite(suiteId: string, additionalEnvironment?: Record<string, string>): Promise<TestResult> {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteId}`);
    }

    const environment = { ...suite.environment, ...additionalEnvironment };
    const results: TestResponse[] = [];
    let totalResponseTime = 0;

    this.logger.log(`Executing test suite: ${suite.name}`);

    // Execute setup requests
    if (suite.setup) {
      for (const setupRequest of suite.setup) {
        const result = await this.executeRequest(setupRequest, environment);
        if (result.error) {
          this.logger.error(`Setup request failed: ${setupRequest.method} ${setupRequest.url}`);
        }
      }
    }

    // Execute main requests
    for (const request of suite.requests) {
      const result = await this.executeRequest(request, environment);
      results.push(result);
      totalResponseTime += result.responseTime;
    }

    // Execute teardown requests
    if (suite.teardown) {
      for (const teardownRequest of suite.teardown) {
        const result = await this.executeRequest(teardownRequest, environment);
        if (result.error) {
          this.logger.error(`Teardown request failed: ${teardownRequest.method} ${teardownRequest.url}`);
        }
      }
    }

    const passedRequests = results.filter(r => r.status >= 200 && r.status < 300).length;
    const failedRequests = results.length - passedRequests;
    const averageResponseTime = results.length > 0 ? totalResponseTime / results.length : 0;

    const testResult: TestResult = {
      suiteId,
      suiteName: suite.name,
      totalRequests: results.length,
      passedRequests,
      failedRequests,
      totalResponseTime,
      averageResponseTime,
      results,
      timestamp: new Date(),
    };

    // Store test result
    const history = this.testHistory.get(suiteId) || [];
    history.push(testResult);
    this.testHistory.set(suiteId, history);

    this.logger.log(`Test suite completed: ${suite.name} - ${passedRequests}/${results.length} passed`);
    return testResult;
  }

  /**
   * Get test suite by ID
   */
  getTestSuite(suiteId: string): TestSuite | undefined {
    return this.testSuites.get(suiteId);
  }

  /**
   * Get all test suites
   */
  getAllTestSuites(): TestSuite[] {
    return Array.from(this.testSuites.values());
  }

  /**
   * Get test history for a suite
   */
  getTestHistory(suiteId: string): TestResult[] {
    return this.testHistory.get(suiteId) || [];
  }

  /**
   * Delete test suite
   */
  deleteTestSuite(suiteId: string): boolean {
    const deleted = this.testSuites.delete(suiteId);
    if (deleted) {
      this.testHistory.delete(suiteId);
      this.logger.log(`Deleted test suite: ${suiteId}`);
    }
    return deleted;
  }

  /**
   * Generate test suite from OpenAPI spec
   */
  generateTestSuiteFromOpenAPI(openApiSpec: any, suiteName: string): string {
    const suiteId = this.createTestSuite({
      name: suiteName,
      description: `Auto-generated test suite from OpenAPI specification`,
    });

    const baseUrl = openApiSpec.servers?.[0]?.url || 'http://localhost:3000';

    for (const [path, pathItem] of Object.entries(openApiSpec.paths || {})) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          this.addRequestToSuite(suiteId, {
            method: method.toUpperCase(),
            url: baseUrl + path,
            description: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
            tags: operation.tags || [],
            headers: this.extractHeadersFromOperation(operation),
            params: this.extractParamsFromOperation(operation),
            body: this.extractBodyFromOperation(operation),
          });
        }
      }
    }

    return suiteId;
  }

  /**
   * Export test suite as JSON
   */
  exportTestSuite(suiteId: string): string | null {
    const suite = this.testSuites.get(suiteId);
    return suite ? JSON.stringify(suite, null, 2) : null;
  }

  /**
   * Import test suite from JSON
   */
  importTestSuite(suiteJson: string): string {
    const suite: TestSuite = JSON.parse(suiteJson);
    return this.createTestSuite(suite);
  }

  /**
   * Process template variables
   */
  private processTemplate(template: string, environment?: Record<string, string>): string {
    if (!environment) return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return environment[key] || match;
    });
  }

  /**
   * Process headers with environment variables
   */
  private processHeaders(headers: Record<string, string>, environment?: Record<string, string>): Record<string, string> {
    const processed: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(headers)) {
      processed[key] = this.processTemplate(value, environment);
    }
    
    return processed;
  }

  /**
   * Process params with environment variables
   */
  private processParams(params: Record<string, any>, environment?: Record<string, string>): Record<string, any> {
    const processed: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        processed[key] = this.processTemplate(value, environment);
      } else {
        processed[key] = value;
      }
    }
    
    return processed;
  }

  /**
   * Extract headers from OpenAPI operation
   */
  private extractHeadersFromOperation(operation: any): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (operation.security && operation.security.some((s: any) => s.bearerAuth)) {
      headers['Authorization'] = 'Bearer {{token}}';
    }

    if (operation.security && operation.security.some((s: any) => s.apiKey)) {
      headers['X-API-Key'] = '{{apiKey}}';
    }

    return headers;
  }

  /**
   * Extract parameters from OpenAPI operation
   */
  private extractParamsFromOperation(operation: any): Record<string, any> {
    const params: Record<string, any> = {};

    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'query' && param.example) {
          params[param.name] = param.example;
        } else if (param.in === 'query' && param.schema?.default) {
          params[param.name] = param.schema.default;
        }
      }
    }

    return params;
  }

  /**
   * Extract request body from OpenAPI operation
   */
  private extractBodyFromOperation(operation: any): any {
    if (operation.requestBody && operation.requestBody.content) {
      const content = operation.requestBody.content['application/json'];
      if (content && content.example) {
        return content.example;
      } else if (content && content.schema?.example) {
        return content.schema.example;
      }
    }
    return null;
  }
}
