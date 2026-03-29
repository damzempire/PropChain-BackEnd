import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentationGenerator, DocumentationAnalytics } from '../docs/DocumentationGenerator';
import { InteractiveTester, TestSuite, TestResult } from '../docs/InteractiveTester';
import { ExampleGenerator, CodeExample, ExampleConfig } from '../docs/ExampleGenerator';
import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface DocumentationConfig {
  enableSwagger: boolean;
  enableInteractiveTesting: boolean;
  enableCodeExamples: boolean;
  enableAnalytics: boolean;
  baseUrl?: string;
  title?: string;
  description?: string;
  version?: string;
}

export interface DocumentationExport {
  swaggerSpec: any;
  postmanCollection: any;
  codeExamples: CodeExample[];
  testSuites: TestSuite[];
  analytics: DocumentationAnalytics[];
  exportDate: Date;
}

@Injectable()
export class DocumentationService implements OnModuleInit {
  private readonly logger = new Logger(DocumentationService.name);
  private app: INestApplication;
  private config: DocumentationConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly documentationGenerator: DocumentationGenerator,
    private readonly interactiveTester: InteractiveTester,
    private readonly exampleGenerator: ExampleGenerator,
  ) {}

  async onModuleInit(): Promise<void> {
    this.config = {
      enableSwagger: this.configService.get<boolean>('DOCS_ENABLE_SWAGGER', true),
      enableInteractiveTesting: this.configService.get<boolean>('DOCS_ENABLE_INTERACTIVE_TESTING', true),
      enableCodeExamples: this.configService.get<boolean>('DOCS_ENABLE_CODE_EXAMPLES', true),
      enableAnalytics: this.configService.get<boolean>('DOCS_ENABLE_ANALYTICS', true),
      baseUrl: this.configService.get<string>('API_BASE_URL', 'http://localhost:3000'),
      title: this.configService.get<string>('API_TITLE', 'PropChain Backend API'),
      description: this.configService.get<string>('API_DESCRIPTION', 'Decentralized Real Estate Infrastructure'),
      version: this.configService.get<string>('API_VERSION', '1.0.0'),
    };

    this.logger.log('Documentation service initialized');
  }

  /**
   * Initialize documentation for the application
   */
  async initializeDocumentation(app: INestApplication): Promise<void> {
    this.app = app;

    if (this.config.enableSwagger) {
      this.documentationGenerator.generateSwaggerDocumentation(app, {
        title: this.config.title,
        description: this.config.description,
        version: this.config.version,
      });
      this.logger.log('Swagger documentation initialized');
    }

    if (this.config.enableCodeExamples) {
      await this.generateCommonExamples();
      this.logger.log('Code examples generated');
    }

    if (this.config.enableInteractiveTesting) {
      await this.generateDefaultTestSuites();
      this.logger.log('Interactive test suites generated');
    }
  }

  /**
   * Generate code examples for common endpoints
   */
  async generateCommonExamples(): Promise<void> {
    const commonEndpoints = [
      { method: 'GET', endpoint: '/api/v1/health', description: 'Health check endpoint' },
      { method: 'GET', endpoint: '/api/v1/properties', description: 'Get all properties' },
      { method: 'POST', endpoint: '/api/v1/properties', description: 'Create a new property' },
      { method: 'GET', endpoint: '/api/v1/properties/:id', description: 'Get property by ID' },
      { method: 'PUT', endpoint: '/api/v1/properties/:id', description: 'Update property' },
      { method: 'DELETE', endpoint: '/api/v1/properties/:id', description: 'Delete property' },
      { method: 'POST', endpoint: '/api/v1/auth/login', description: 'User authentication' },
      { method: 'POST', endpoint: '/api/v1/auth/register', description: 'User registration' },
      { method: 'GET', endpoint: '/api/v1/users/profile', description: 'Get user profile' },
      { method: 'GET', endpoint: '/api/v1/transactions', description: 'Get all transactions' },
    ];

    const exampleConfig: ExampleConfig = {
      includeAuthentication: true,
      includeErrorHandling: true,
      includeComments: true,
      baseUrl: this.config.baseUrl,
    };

    for (const endpoint of commonEndpoints) {
      this.exampleGenerator.generateExamples(
        endpoint.endpoint,
        endpoint.method,
        endpoint.description,
        exampleConfig,
      );
    }
  }

  /**
   * Generate default test suites
   */
  async generateDefaultTestSuites(): Promise<void> {
    // Health check test suite
    const healthSuiteId = this.interactiveTester.createTestSuite({
      name: 'Health Check Tests',
      description: 'Test suite for health check endpoints',
      requests: [
        {
          id: 'health-check',
          method: 'GET',
          url: this.config.baseUrl + '/api/v1/health',
          description: 'Basic health check',
        },
        {
          id: 'liveness-check',
          method: 'GET',
          url: this.config.baseUrl + '/api/v1/health/liveness',
          description: 'Liveness probe',
        },
        {
          id: 'readiness-check',
          method: 'GET',
          url: this.config.baseUrl + '/api/v1/health/readiness',
          description: 'Readiness probe',
        },
      ],
    });

    // Authentication test suite
    const authSuiteId = this.interactiveTester.createTestSuite({
      name: 'Authentication Tests',
      description: 'Test suite for authentication endpoints',
      environment: {
        username: 'test@example.com',
        password: 'testpassword123',
      },
      requests: [
        {
          id: 'user-registration',
          method: 'POST',
          url: this.config.baseUrl + '/api/v1/auth/register',
          description: 'Register new user',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            email: '{{username}}',
            password: '{{password}}',
            firstName: 'Test',
            lastName: 'User',
          },
        },
        {
          id: 'user-login',
          method: 'POST',
          url: this.config.baseUrl + '/api/v1/auth/login',
          description: 'User login',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            email: '{{username}}',
            password: '{{password}}',
          },
        },
      ],
    });

    // Properties test suite
    const propertiesSuiteId = this.interactiveTester.createTestSuite({
      name: 'Properties API Tests',
      description: 'Test suite for properties endpoints',
      environment: {
        token: 'your-jwt-token-here',
      },
      setup: [
        {
          id: 'auth-setup',
          method: 'POST',
          url: this.config.baseUrl + '/api/v1/auth/login',
          description: 'Setup authentication',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            email: 'test@example.com',
            password: 'testpassword123',
          },
        },
      ],
      requests: [
        {
          id: 'get-properties',
          method: 'GET',
          url: this.config.baseUrl + '/api/v1/properties',
          description: 'Get all properties',
          headers: {
            'Authorization': 'Bearer {{token}}',
          },
        },
        {
          id: 'create-property',
          method: 'POST',
          url: this.config.baseUrl + '/api/v1/properties',
          description: 'Create new property',
          headers: {
            'Authorization': 'Bearer {{token}}',
            'Content-Type': 'application/json',
          },
          body: {
            title: 'Test Property',
            description: 'A test property for API testing',
            address: '123 Test Street',
            price: 250000,
            bedrooms: 3,
            bathrooms: 2,
            area: 1500,
          },
        },
      ],
    });

    this.logger.log(`Generated ${3} default test suites`);
  }

  /**
   * Get comprehensive documentation export
   */
  async exportDocumentation(): Promise<DocumentationExport> {
    const swaggerSpec = this.getSwaggerSpec();
    const postmanCollection = this.getPostmanCollection();
    const codeExamples = this.getAllCodeExamples();
    const testSuites = this.interactiveTester.getAllTestSuites();
    const analytics = this.documentationGenerator.getAnalytics();

    return {
      swaggerSpec,
      postmanCollection,
      codeExamples,
      testSuites,
      analytics,
      exportDate: new Date(),
    };
  }

  /**
   * Get Swagger specification
   */
  getSwaggerSpec(): any {
    if (!this.app) {
      throw new Error('Application not initialized. Call initializeDocumentation first.');
    }

    // This would typically extract the Swagger document from the app
    // For now, return a placeholder
    return {
      openapi: '3.0.0',
      info: {
        title: this.config.title,
        version: this.config.version,
        description: this.config.description,
      },
      paths: {},
    };
  }

  /**
   * Get Postman collection
   */
  getPostmanCollection(): any {
    if (!this.app) {
      throw new Error('Application not initialized. Call initializeDocumentation first.');
    }

    // Generate Postman collection from current app
    return this.documentationGenerator.convertToPostmanCollection(this.getSwaggerSpec());
  }

  /**
   * Get all code examples
   */
  getAllCodeExamples(): CodeExample[] {
    const examples: CodeExample[] = [];
    
    // Get examples from common endpoints
    const commonEndpoints = [
      '/api/v1/health',
      '/api/v1/properties',
      '/api/v1/auth/login',
      '/api/v1/auth/register',
    ];

    for (const endpoint of commonEndpoints) {
      const getExamples = this.exampleGenerator.getExamples(endpoint, 'GET');
      const postExamples = this.exampleGenerator.getExamples(endpoint, 'POST');
      examples.push(...getExamples, ...postExamples);
    }

    return examples;
  }

  /**
   * Execute test suite
   */
  async executeTestSuite(suiteId: string, environment?: Record<string, string>): Promise<TestResult> {
    return this.interactiveTester.executeTestSuite(suiteId, environment);
  }

  /**
   * Get test suite results
   */
  getTestSuiteResults(suiteId: string): TestResult[] {
    return this.interactiveTester.getTestHistory(suiteId);
  }

  /**
   * Create custom test suite
   */
  createTestSuite(suite: Omit<TestSuite, 'id'>): string {
    return this.interactiveTester.createTestSuite(suite);
  }

  /**
   * Generate code examples for specific endpoint
   */
  generateCodeExamples(
    endpoint: string,
    method: string,
    description: string,
    config?: Partial<ExampleConfig>,
  ): CodeExample[] {
    const finalConfig: ExampleConfig = {
      includeAuthentication: true,
      includeErrorHandling: true,
      includeComments: true,
      baseUrl: this.config.baseUrl,
      ...config,
    };

    return this.exampleGenerator.generateExamples(endpoint, method, description, finalConfig);
  }

  /**
   * Get documentation analytics
   */
  getAnalytics(): DocumentationAnalytics[] {
    return this.documentationGenerator.getAnalytics();
  }

  /**
   * Get endpoint analytics
   */
  getEndpointAnalytics(endpoint: string, method: string): DocumentationAnalytics | undefined {
    return this.documentationGenerator.getEndpointAnalytics(endpoint, method);
  }

  /**
   * Track API usage for analytics
   */
  trackApiUsage(endpoint: string, method: string, responseTime: number, isError: boolean = false): void {
    if (this.config.enableAnalytics) {
      this.documentationGenerator.trackAnalytics(endpoint, method, responseTime, isError);
    }
  }

  /**
   * Export documentation to files
   */
  async exportToFiles(outputDir: string): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Export Swagger spec
    const swaggerSpec = this.getSwaggerSpec();
    fs.writeFileSync(
      path.join(outputDir, 'swagger-spec.json'),
      JSON.stringify(swaggerSpec, null, 2),
    );

    // Export Postman collection
    const postmanCollection = this.getPostmanCollection();
    fs.writeFileSync(
      path.join(outputDir, 'postman-collection.json'),
      JSON.stringify(postmanCollection, null, 2),
    );

    // Export code examples
    this.exampleGenerator.exportExamples(path.join(outputDir, 'code-examples'));

    // Export test suites
    const testSuites = this.interactiveTester.getAllTestSuites();
    fs.writeFileSync(
      path.join(outputDir, 'test-suites.json'),
      JSON.stringify(testSuites, null, 2),
    );

    // Export analytics
    const analytics = this.getAnalytics();
    fs.writeFileSync(
      path.join(outputDir, 'analytics.json'),
      JSON.stringify(analytics, null, 2),
    );

    // Create README
    const readme = this.generateDocumentationReadme();
    fs.writeFileSync(path.join(outputDir, 'README.md'), readme);

    this.logger.log(`Documentation exported to ${outputDir}`);
  }

  /**
   * Generate documentation README
   */
  private generateDocumentationReadme(): string {
    const timestamp = new Date().toISOString();
    
    return `# API Documentation Export

Generated on: ${timestamp}

## Files Overview

- \`swagger-spec.json\` - OpenAPI 3.0 specification
- \`postman-collection.json\` - Postman collection for API testing
- \`code-examples/\` - Code examples in multiple programming languages
- \`test-suites.json\` - Interactive test suites
- \`analytics.json\` - API usage analytics

## Usage

### Import Postman Collection
1. Open Postman
2. Click Import
3. Select the \`postman-collection.json\` file

### Run Code Examples
Navigate to the \`code-examples\` directory and find examples in your preferred programming language.

### Execute Test Suites
Use the interactive tester or import the test suites into your preferred testing tool.

## Configuration

- Base URL: ${this.config.baseUrl}
- API Version: ${this.config.version}
- Generated by: PropChain Backend Documentation Service
`;
  }

  /**
   * Reset documentation analytics
   */
  resetAnalytics(): void {
    this.documentationGenerator.resetAnalytics();
    this.logger.log('Documentation analytics reset');
  }

  /**
   * Get documentation configuration
   */
  getConfig(): DocumentationConfig {
    return { ...this.config };
  }

  /**
   * Update documentation configuration
   */
  updateConfig(updates: Partial<DocumentationConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.log('Documentation configuration updated');
  }
}
