import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ApiDocumentationConfig {
  title: string;
  description: string;
  version: string;
  tags?: string[];
  servers?: Array<{
    url: string;
    description: string;
  }>;
  contact?: {
    name: string;
    email: string;
    url?: string;
  };
  license?: {
    name: string;
    url: string;
  };
}

export interface DocumentationAnalytics {
  endpoint: string;
  method: string;
  accessCount: number;
  lastAccessed: Date;
  averageResponseTime: number;
  errorRate: number;
}

@Injectable()
export class DocumentationGenerator {
  private readonly logger = new Logger(DocumentationGenerator.name);
  private analytics: Map<string, DocumentationAnalytics> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate comprehensive Swagger documentation
   */
  generateSwaggerDocumentation(app: INestApplication, config?: Partial<ApiDocumentationConfig>): void {
    const defaultConfig: ApiDocumentationConfig = {
      title: this.configService.get('API_TITLE', 'PropChain Backend API'),
      description: this.configService.get('API_DESCRIPTION', 'Decentralized Real Estate Infrastructure - Backend API for blockchain-powered property transactions'),
      version: this.configService.get('API_VERSION', '1.0.0'),
      tags: ['properties', 'users', 'transactions', 'blockchain', 'auth', 'security'],
      servers: [
        {
          url: this.configService.get('API_BASE_URL', 'http://localhost:3000'),
          description: 'Development Server',
        },
        {
          url: this.configService.get('API_PROD_URL', 'https://api.propchain.io'),
          description: 'Production Server',
        },
      ],
      contact: {
        name: 'PropChain Team',
        email: 'support@propchain.io',
        url: 'https://propchain.io',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    };

    const finalConfig = { ...defaultConfig, ...config };

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(finalConfig.title)
        .setDescription(finalConfig.description)
        .setVersion(finalConfig.version)
        .addTag(finalConfig.tags || [])
        .addBearerAuth()
        .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' })
        .addServer(finalConfig.servers![0].url, finalConfig.servers![0].description)
        .addServer(finalConfig.servers![1].url, finalConfig.servers![1].description)
        .setContact(finalConfig.contact!.name, finalConfig.contact!.url || '', finalConfig.contact!.email)
        .setLicense(finalConfig.license!.name, finalConfig.license!.url)
        .build(),
    );

    // Setup Swagger UI
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        docExpansion: 'none',
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
      },
      customSiteTitle: `${finalConfig.title} - Documentation`,
      customfavIcon: '/favicon.ico',
      customCss: `
        .topbar-wrapper img { content: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzJEMUQ0QiIvPgo8cGF0aCBkPSJNOCAxNkgxNlY4SDhWMTZaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTYgMjRIMjRWMTZIMTZWMjRaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K'); }
        .swagger-ui .topbar { background-color: #2D1D4B; }
        .swagger-ui .topbar-wrapper .link { color: white; }
      `,
    });

    // Save documentation to file for versioning
    this.saveDocumentationToFile(document, finalConfig.version);
    
    this.logger.log(`Swagger documentation generated successfully for version ${finalConfig.version}`);
  }

  /**
   * Generate OpenAPI 3.0 specification file
   */
  generateOpenApiSpec(app: INestApplication, outputPath?: string): void {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const specPath = outputPath || path.join(process.cwd(), 'docs', 'openapi-spec.json');
    
    // Ensure directory exists
    const dir = path.dirname(specPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(specPath, JSON.stringify(document, null, 2));
    this.logger.log(`OpenAPI specification saved to ${specPath}`);
  }

  /**
   * Generate Postman collection from API documentation
   */
  generatePostmanCollection(app: INestApplication, outputPath?: string): void {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const collection = this.convertToPostmanCollection(document);
    const collectionPath = outputPath || path.join(process.cwd(), 'docs', 'postman-collection.json');
    
    // Ensure directory exists
    const dir = path.dirname(collectionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
    this.logger.log(`Postman collection saved to ${collectionPath}`);
  }

  /**
   * Track documentation analytics
   */
  trackAnalytics(endpoint: string, method: string, responseTime: number, isError: boolean = false): void {
    const key = `${method}:${endpoint}`;
    const existing = this.analytics.get(key);
    
    const analytics: DocumentationAnalytics = existing || {
      endpoint,
      method,
      accessCount: 0,
      lastAccessed: new Date(),
      averageResponseTime: 0,
      errorRate: 0,
    };

    analytics.accessCount++;
    analytics.lastAccessed = new Date();
    
    // Update average response time
    analytics.averageResponseTime = (analytics.averageResponseTime * (analytics.accessCount - 1) + responseTime) / analytics.accessCount;
    
    // Update error rate
    if (isError) {
      analytics.errorRate = ((analytics.errorRate * (analytics.accessCount - 1)) + 1) / analytics.accessCount;
    } else {
      analytics.errorRate = (analytics.errorRate * (analytics.accessCount - 1)) / analytics.accessCount;
    }

    this.analytics.set(key, analytics);
  }

  /**
   * Get documentation analytics
   */
  getAnalytics(): DocumentationAnalytics[] {
    return Array.from(this.analytics.values());
  }

  /**
   * Get analytics for specific endpoint
   */
  getEndpointAnalytics(endpoint: string, method: string): DocumentationAnalytics | undefined {
    return this.analytics.get(`${method}:${endpoint}`);
  }

  /**
   * Reset analytics
   */
  resetAnalytics(): void {
    this.analytics.clear();
    this.logger.log('Documentation analytics reset');
  }

  /**
   * Save documentation to file with versioning
   */
  private saveDocumentationToFile(document: any, version: string): void {
    const docsDir = path.join(process.cwd(), 'docs', 'versions');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const filePath = path.join(docsDir, `api-docs-v${version}.json`);
    fs.writeFileSync(filePath, JSON.stringify(document, null, 2));
    
    // Also save as latest
    const latestPath = path.join(docsDir, 'api-docs-latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(document, null, 2));
  }

  /**
   * Convert OpenAPI spec to Postman collection
   */
  private convertToPostmanCollection(document: any): any {
    return {
      info: {
        name: document.info?.title || 'API Collection',
        description: document.info?.description || '',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: this.convertPathsToPostmanItems(document.paths || {}),
      variable: [
        {
          key: 'baseUrl',
          value: document.servers?.[0]?.url || 'http://localhost:3000',
          type: 'string',
        },
      ],
    };
  }

  /**
   * Convert OpenAPI paths to Postman items
   */
  private convertPathsToPostmanItems(paths: Record<string, any>): any[] {
    const items: any[] = [];

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (method === 'get' || method === 'post' || method === 'put' || method === 'delete' || method === 'patch') {
          items.push({
            name: operation.operationId || operation.summary || `${method.toUpperCase()} ${path}`,
            request: {
              method: method.toUpperCase(),
              header: this.generateHeadersFromOperation(operation),
              url: {
                raw: '{{baseUrl}}' + path,
                host: ['{{baseUrl}}'],
                path: path.split('/').filter(p => p),
              },
              description: operation.description || '',
            },
            response: [],
          });
        }
      }
    }

    return items;
  }

  /**
   * Generate headers from operation
   */
  private generateHeadersFromOperation(operation: any): any[] {
    const headers: any[] = [
      {
        key: 'Content-Type',
        value: 'application/json',
      },
    ];

    if (operation.security && operation.security.some((s: any) => s.bearerAuth)) {
      headers.push({
        key: 'Authorization',
        value: 'Bearer {{token}}',
      });
    }

    return headers;
  }
}
