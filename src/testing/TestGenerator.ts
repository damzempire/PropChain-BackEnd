import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerDocumentOptions, SwaggerModule } from '@nestjs/swagger';
import { Request } from 'express';
import { faker } from '@faker-js/faker';
import * as fs from 'fs';
import * as path from 'path';

export interface ApiEndpoint {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  parameters?: any[];
  requestBody?: any;
  responses?: any;
  tags?: string[];
}

export interface GeneratedTest {
  testName: string;
  endpoint: string;
  method: string;
  testCode: string;
  mockData: any;
  assertions: string[];
}

export interface TestGenerationOptions {
  includeNegativeTests?: boolean;
  includeEdgeCases?: boolean;
  includePerformanceTests?: boolean;
  customAssertions?: string[];
  mockDataStrategy?: 'random' | 'realistic' | 'minimal';
}

@Injectable()
export class TestGenerator {
  private readonly logger = new Logger(TestGenerator.name);
  private readonly testOutputDir = 'tests/generated';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate comprehensive API tests based on OpenAPI/Swagger specification
   */
  async generateTestsFromSpec(
    swaggerSpec: any,
    options: TestGenerationOptions = {}
  ): Promise<GeneratedTest[]> {
    this.logger.log('Generating tests from OpenAPI specification...');
    
    const generatedTests: GeneratedTest[] = [];
    const paths = swaggerSpec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (this.isHttpMethod(method)) {
          const test = await this.generateTestForEndpoint(
            path,
            method.toUpperCase(),
            operation as any,
            options
          );
          generatedTests.push(test);
        }
      }
    }

    await this.saveGeneratedTests(generatedTests);
    return generatedTests;
  }

  /**
   * Generate test for a specific API endpoint
   */
  async generateTestForEndpoint(
    path: string,
    method: string,
    operation: any,
    options: TestGenerationOptions
  ): Promise<GeneratedTest> {
    const testName = this.generateTestName(path, method, operation);
    const mockData = this.generateMockData(operation, options.mockDataStrategy);
    const assertions = this.generateAssertions(operation, options);
    const testCode = this.generateTestCode(path, method, operation, mockData, assertions, options);

    return {
      testName,
      endpoint: path,
      method,
      testCode,
      mockData,
      assertions
    };
  }

  /**
   * Generate tests from actual HTTP requests (request recording)
   */
  async generateTestsFromRequests(requests: Request[]): Promise<GeneratedTest[]> {
    this.logger.log('Generating tests from recorded requests...');
    
    const groupedRequests = this.groupRequestsByEndpoint(requests);
    const generatedTests: GeneratedTest[] = [];

    for (const [key, requestGroup] of Object.entries(groupedRequests)) {
      const [path, method] = key.split(':');
      const test = await this.generateTestFromRequestGroup(path, method, requestGroup);
      generatedTests.push(test);
    }

    return generatedTests;
  }

  /**
   * Generate contract tests based on API schemas
   */
  async generateContractTests(schemas: any): Promise<GeneratedTest[]> {
    this.logger.log('Generating contract tests...');
    
    const tests: GeneratedTest[] = [];
    
    for (const [schemaName, schema] of Object.entries(schemas)) {
      const test = this.generateSchemaValidationTest(schemaName, schema as any);
      tests.push(test);
    }

    return tests;
  }

  /**
   * Generate performance benchmark tests
   */
  async generatePerformanceTests(endpoints: ApiEndpoint[]): Promise<GeneratedTest[]> {
    this.logger.log('Generating performance tests...');
    
    const tests: GeneratedTest[] = [];
    
    for (const endpoint of endpoints) {
      const test = this.generatePerformanceTest(endpoint);
      tests.push(test);
    }

    return tests;
  }

  private generateTestName(path: string, method: string, operation: any): string {
    const operationId = operation.operationId || '';
    const summary = operation.summary || '';
    const pathSanitized = path.replace(/[^a-zA-Z0-9]/g, '_');
    
    if (operationId) {
      return `${method.toLowerCase()}_${operationId.replace(/[^a-zA-Z0-9]/g, '_')}_test`;
    }
    
    if (summary) {
      return `${method.toLowerCase()}_${summary.replace(/[^a-zA-Z0-9]/g, '_')}_test`;
    }
    
    return `${method.toLowerCase()}${pathSanitized}_test`;
  }

  private generateMockData(operation: any, strategy: string = 'realistic'): any {
    const mockData: any = {};

    // Generate request body mock data
    if (operation.requestBody && operation.requestBody.content) {
      const content = operation.requestBody.content;
      const jsonContent = content['application/json'];
      
      if (jsonContent && jsonContent.schema) {
        mockData.requestBody = this.generateDataFromSchema(jsonContent.schema, strategy);
      }
    }

    // Generate parameter mock data
    if (operation.parameters) {
      mockData.parameters = {};
      for (const param of operation.parameters) {
        if (param.in === 'path' || param.in === 'query') {
          mockData.parameters[param.name] = this.generateDataFromSchema(param.schema, strategy);
        }
      }
    }

    return mockData;
  }

  private generateDataFromSchema(schema: any, strategy: string): any {
    switch (strategy) {
      case 'random':
        return this.generateRandomData(schema);
      case 'realistic':
        return this.generateRealisticData(schema);
      case 'minimal':
        return this.generateMinimalData(schema);
      default:
        return this.generateRealisticData(schema);
    }
  }

  private generateRandomData(schema: any): any {
    switch (schema.type) {
      case 'string':
        return faker.lorem.word();
      case 'number':
        return faker.datatype.number();
      case 'integer':
        return faker.datatype.number({ min: 1, max: 1000 });
      case 'boolean':
        return faker.datatype.boolean();
      case 'array':
        return Array.from({ length: faker.datatype.number({ min: 1, max: 5 }) }, 
          () => this.generateRandomData(schema.items));
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          for (const [key, value] of Object.entries(schema.properties)) {
            obj[key] = this.generateRandomData(value as any);
          }
        }
        return obj;
      default:
        return null;
    }
  }

  private generateRealisticData(schema: any): any {
    switch (schema.type) {
      case 'string':
        if (schema.format === 'email') return faker.internet.email();
        if (schema.format === 'date') return faker.date.recent().toISOString();
        if (schema.format === 'uuid') return faker.datatype.uuid();
        if (schema.pattern) return faker.helpers.replaceSymbolWithNumber(schema.pattern);
        return faker.lorem.sentence();
      case 'number':
        return faker.datatype.float({ min: 0, max: 10000 });
      case 'integer':
        return faker.datatype.number({ min: 1, max: 1000000 });
      case 'boolean':
        return faker.datatype.boolean();
      case 'array':
        return Array.from({ length: faker.datatype.number({ min: 1, max: 3 }) }, 
          () => this.generateRealisticData(schema.items));
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          for (const [key, value] of Object.entries(schema.properties)) {
            obj[key] = this.generateRealisticData(value as any);
          }
        }
        return obj;
      default:
        return null;
    }
  }

  private generateMinimalData(schema: any): any {
    switch (schema.type) {
      case 'string':
        return 'test';
      case 'number':
        return 1;
      case 'integer':
        return 1;
      case 'boolean':
        return true;
      case 'array':
        return [this.generateMinimalData(schema.items)];
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          const required = schema.required || [];
          for (const key of required) {
            if (schema.properties[key]) {
              obj[key] = this.generateMinimalData(schema.properties[key]);
            }
          }
        }
        return obj;
      default:
        return null;
    }
  }

  private generateAssertions(operation: any, options: TestGenerationOptions): string[] {
    const assertions: string[] = [];

    // Basic status code assertions
    if (operation.responses) {
      const successResponses = Object.keys(operation.responses).filter(code => 
        code.startsWith('2') || code.startsWith('3')
      );
      
      for (const code of successResponses) {
        assertions.push(`expect(response.status).toBe(${code});`);
      }
    }

    // Response schema assertions
    if (operation.responses && operation.responses['200']) {
      const response200 = operation.responses['200'];
      if (response200.content && response200.content['application/json']) {
        const schema = response200.content['application/json'].schema;
        assertions.push(...this.generateSchemaAssertions(schema, 'response.body'));
      }
    }

    // Custom assertions
    if (options.customAssertions) {
      assertions.push(...options.customAssertions);
    }

    return assertions;
  }

  private generateSchemaAssertions(schema: any, path: string): string[] {
    const assertions: string[] = [];

    switch (schema.type) {
      case 'object':
        assertions.push(`expect(${path}).toBeDefined();`);
        assertions.push(`expect(typeof ${path}).toBe('object');`);
        
        if (schema.properties) {
          for (const [key, value] of Object.entries(schema.properties)) {
            const valueSchema = value as any;
            if (valueSchema.required) {
              assertions.push(`expect(${path}).toHaveProperty('${key}');`);
            }
            assertions.push(...this.generateSchemaAssertions(valueSchema, `${path}.${key}`));
          }
        }
        break;
      case 'array':
        assertions.push(`expect(Array.isArray(${path})).toBe(true);`);
        if (schema.items) {
          assertions.push(...this.generateSchemaAssertions(schema.items, `${path}[0]`));
        }
        break;
      case 'string':
        assertions.push(`expect(typeof ${path}).toBe('string');`);
        break;
      case 'number':
      case 'integer':
        assertions.push(`expect(typeof ${path}).toBe('number');`);
        break;
      case 'boolean':
        assertions.push(`expect(typeof ${path}).toBe('boolean');`);
        break;
    }

    return assertions;
  }

  private generateTestCode(
    path: string,
    method: string,
    operation: any,
    mockData: any,
    assertions: string[],
    options: TestGenerationOptions
  ): string {
    const testName = this.generateTestName(path, method, operation);
    const hasRequestBody = ['POST', 'PUT', 'PATCH'].includes(method);
    
    let testCode = `
describe('${testName}', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should handle ${method} ${path} successfully', async () => {
    ${hasRequestBody ? `const requestBody = ${JSON.stringify(mockData.requestBody, null, 6)};` : ''}
    ${mockData.parameters ? `const params = ${JSON.stringify(mockData.parameters, null, 6)};` : ''}
    
    const response = await request(app.getHttpServer())
      .${method.toLowerCase()}('${path.replace(/:([^/]+)/g, '${params.$1}')}')
      ${hasRequestBody ? `.send(requestBody)` : ''}
      .expect(200);

    ${assertions.join('\n    ')}
  });`;

    if (options.includeNegativeTests) {
      testCode += this.generateNegativeTests(path, method, operation, mockData);
    }

    if (options.includeEdgeCases) {
      testCode += this.generateEdgeCaseTests(path, method, operation, mockData);
    }

    testCode += `
});`;

    return testCode;
  }

  private generateNegativeTests(path: string, method: string, operation: any, mockData: any): string {
    return `
  it('should handle invalid request data', async () => {
    const invalidData = { invalid: 'data' };
    
    const response = await request(app.getHttpServer())
      .${method.toLowerCase()}('${path}')
      .send(invalidData)
      .expect(400);
  });

  it('should handle unauthorized access', async () => {
    const response = await request(app.getHttpServer())
      .${method.toLowerCase()}('${path}')
      .expect(401);
  });`;
  }

  private generateEdgeCaseTests(path: string, method: string, operation: any, mockData: any): string {
    return `
  it('should handle empty request', async () => {
    const response = await request(app.getHttpServer())
      .${method.toLowerCase()}('${path}')
      .send({})
      .expect(400);
  });`;
  }

  private generatePerformanceTest(endpoint: ApiEndpoint): GeneratedTest {
    const testName = `performance_${endpoint.method.toLowerCase()}_${endpoint.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    const testCode = `
describe('${testName}', () => {
  it('should meet performance requirements', async () => {
    const startTime = Date.now();
    const iterations = 100;
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await request(app.getHttpServer())
        .${endpoint.method.toLowerCase()}('${endpoint.path}')
        .expect(200);
      results.push(Date.now() - start);
    }

    const totalTime = Date.now() - startTime;
    const avgTime = results.reduce((a, b) => a + b, 0) / results.length;
    const maxTime = Math.max(...results);

    console.log(\`Performance stats for ${endpoint.method} ${endpoint.path}:\`);
    console.log(\`Total time: \${totalTime}ms\`);
    console.log(\`Average time: \${avgTime}ms\`);
    console.log(\`Max time: \${maxTime}ms\`);

    expect(avgTime).toBeLessThan(1000); // Average response time should be less than 1 second
    expect(maxTime).toBeLessThan(5000); // Max response time should be less than 5 seconds
  });
});`;

    return {
      testName,
      endpoint: endpoint.path,
      method: endpoint.method,
      testCode,
      mockData: {},
      assertions: []
    };
  }

  private generateSchemaValidationTest(schemaName: string, schema: any): GeneratedTest {
    const testName = `schema_validation_${schemaName}`;
    
    const testCode = `
describe('${testName}', () => {
  it('should validate ${schemaName} schema', async () => {
    const validData = ${JSON.stringify(this.generateRealisticData(schema), null, 6)};
    
    // Test valid data
    expect(() => validateSchema(validData, schema)).not.toThrow();
    
    // Test invalid data
    const invalidData = { invalid: 'data' };
    expect(() => validateSchema(invalidData, schema)).toThrow();
  });
});`;

    return {
      testName,
      endpoint: '',
      method: '',
      testCode,
      mockData: this.generateRealisticData(schema),
      assertions: []
    };
  }

  private groupRequestsByEndpoint(requests: Request[]): Record<string, Request[]> {
    const grouped: Record<string, Request[]> = {};
    
    for (const request of requests) {
      const key = `${request.path}:${request.method}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(request);
    }
    
    return grouped;
  }

  private async generateTestFromRequestGroup(path: string, method: string, requests: Request[]): Promise<GeneratedTest> {
    const testName = `recorded_${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const sampleRequest = requests[0];
    
    const testCode = `
describe('${testName}', () => {
  it('should reproduce recorded request', async () => {
    const response = await request(app.getHttpServer())
      .${method.toLowerCase()}('${path}')
      .send(${JSON.stringify(sampleRequest.body, null, 6)})
      .expect(${sampleRequest.statusCode || 200});
  });
});`;

    return {
      testName,
      endpoint: path,
      method,
      testCode,
      mockData: sampleRequest.body,
      assertions: []
    };
  }

  private isHttpMethod(method: string): boolean {
    return ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method);
  }

  private async saveGeneratedTests(tests: GeneratedTest[]): Promise<void> {
    if (!fs.existsSync(this.testOutputDir)) {
      fs.mkdirSync(this.testOutputDir, { recursive: true });
    }

    for (const test of tests) {
      const filePath = path.join(this.testOutputDir, `${test.testName}.spec.ts`);
      fs.writeFileSync(filePath, test.testCode);
    }

    this.logger.log(`Generated ${tests.length} test files in ${this.testOutputDir}`);
  }
}
