import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { Storage } from '@google-cloud/storage';
import * as azure from '@azure/storage-blob';
import { CircuitBreaker } from 'opossum';
import { EventEmitter } from 'events';

export enum CloudProvider {
  AWS_S3 = 'aws_s3',
  GOOGLE_CLOUD = 'google_cloud',
  AZURE_BLOB = 'azure_blob',
}

export interface StorageConfig {
  provider: CloudProvider;
  region: string;
  bucket: string;
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    subscriptionId?: string;
    keyFilename?: string;
  };
  endpoint?: string;
  forcePathStyle?: boolean;
  retryAttempts?: number;
  timeout?: number;
}

export interface UploadResult {
  success: boolean;
  provider: CloudProvider;
  key: string;
  url?: string;
  etag?: string;
  size?: number;
  error?: string;
  uploadTime?: number;
}

export interface DownloadResult {
  success: boolean;
  provider: CloudProvider;
  data?: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  error?: string;
  downloadTime?: number;
}

export interface HealthCheck {
  provider: CloudProvider;
  healthy: boolean;
  latency: number;
  error?: string;
  lastChecked: Date;
}

@Injectable()
export class MultiCloudManager extends EventEmitter {
  private readonly logger = new Logger(MultiCloudManager.name);
  private readonly providers = new Map<CloudProvider, any>();
  private readonly circuitBreakers = new Map<CloudProvider, CircuitBreaker>();
  private readonly healthStatus = new Map<CloudProvider, HealthCheck>();
  private readonly primaryProvider: CloudProvider;
  private readonly failoverProviders: CloudProvider[];

  constructor(private readonly configService: ConfigService) {
    super();
    
    this.primaryProvider = this.configService.get<CloudProvider>('STORAGE_PRIMARY_PROVIDER') || CloudProvider.AWS_S3;
    this.failoverProviders = this.configService.get<CloudProvider[]>('STORAGE_FAILOVER_PROVIDERS') || [
      CloudProvider.GOOGLE_CLOUD,
      CloudProvider.AZURE_BLOB,
    ];

    this.initializeProviders();
    this.initializeCircuitBreakers();
    this.startHealthChecks();
  }

  private initializeProviders(): void {
    const configs = this.getProviderConfigs();
    
    for (const [provider, config] of Object.entries(configs)) {
      try {
        this.initializeProvider(provider as CloudProvider, config);
      } catch (error) {
        this.logger.error(`Failed to initialize ${provider}: ${error.message}`);
      }
    }
  }

  private initializeProvider(provider: CloudProvider, config: StorageConfig): void {
    switch (provider) {
      case CloudProvider.AWS_S3:
        this.providers.set(provider, new AWS.S3({
          accessKeyId: config.credentials?.accessKeyId,
          secretAccessKey: config.credentials?.secretAccessKey,
          region: config.region,
          endpoint: config.endpoint,
          s3ForcePathStyle: config.forcePathStyle || false,
          maxRetries: config.retryAttempts || 3,
          httpOptions: {
            timeout: config.timeout || 30000,
          },
        }));
        break;

      case CloudProvider.GOOGLE_CLOUD:
        this.providers.set(provider, new Storage({
          projectId: this.configService.get('GOOGLE_CLOUD_PROJECT_ID'),
          keyFilename: config.credentials?.keyFilename,
          retryOptions: {
            autoRetry: true,
            maxRetries: config.retryAttempts || 3,
            retryDelayMultiplier: 2,
            totalRetryTimeout: config.timeout || 30000,
          },
        }));
        break;

      case CloudProvider.AZURE_BLOB:
        const blobServiceClient = azure.BlobServiceClient.fromConnectionString(
          `DefaultEndpointsProtocol=https;AccountName=${config.credentials?.clientId};AccountKey=${config.credentials?.clientSecret};EndpointSuffix=core.windows.net`
        );
        this.providers.set(provider, blobServiceClient);
        break;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    this.logger.log(`Initialized ${provider} provider`);
  }

  private initializeCircuitBreakers(): void {
    for (const provider of this.providers.keys()) {
      const breaker = new CircuitBreaker(
        async (...args: any[]) => this.executeOperation(provider, ...args),
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 60000,
          rollingCountTimeout: 60000,
          rollingCountBuckets: 10,
        }
      );

      breaker.on('open', () => {
        this.logger.warn(`Circuit breaker opened for ${provider}`);
        this.emit('circuitBreakerOpened', provider);
      });

      breaker.on('halfOpen', () => {
        this.logger.log(`Circuit breaker half-open for ${provider}`);
      });

      breaker.on('close', () => {
        this.logger.log(`Circuit breaker closed for ${provider}`);
        this.emit('circuitBreakerClosed', provider);
      });

      this.circuitBreakers.set(provider, breaker);
    }
  }

  async uploadFile(
    key: string,
    data: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.uploadWithFailover(key, data, contentType, metadata);
      result.uploadTime = Date.now() - startTime;
      
      this.logger.log(`File uploaded successfully to ${result.provider}: ${key}`);
      this.emit('fileUploaded', { key, provider: result.provider, size: data.length });
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to upload file ${key}: ${error.message}`);
      return {
        success: false,
        provider: this.primaryProvider,
        key,
        error: error.message,
        uploadTime: Date.now() - startTime,
      };
    }
  }

  private async uploadWithFailover(
    key: string,
    data: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    const providersToTry = [this.primaryProvider, ...this.failoverProviders];
    
    for (const provider of providersToTry) {
      if (!this.providers.has(provider)) {
        continue;
      }

      const circuitBreaker = this.circuitBreakers.get(provider);
      if (circuitBreaker?.opened) {
        this.logger.warn(`Skipping ${provider} - circuit breaker is open`);
        continue;
      }

      try {
        const result = await circuitBreaker?.fire('upload', key, data, contentType, metadata);
        if (result?.success) {
          return result;
        }
      } catch (error) {
        this.logger.warn(`Upload failed on ${provider}: ${error.message}`);
        continue;
      }
    }

    throw new Error('All storage providers failed');
  }

  async downloadFile(key: string): Promise<DownloadResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.downloadWithFailover(key);
      result.downloadTime = Date.now() - startTime;
      
      this.logger.log(`File downloaded successfully from ${result.provider}: ${key}`);
      this.emit('fileDownloaded', { key, provider: result.provider, size: result.data?.length });
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to download file ${key}: ${error.message}`);
      return {
        success: false,
        provider: this.primaryProvider,
        key,
        error: error.message,
        downloadTime: Date.now() - startTime,
      };
    }
  }

  private async downloadWithFailover(key: string): Promise<DownloadResult> {
    const providersToTry = [this.primaryProvider, ...this.failoverProviders];
    
    for (const provider of providersToTry) {
      if (!this.providers.has(provider)) {
        continue;
      }

      const circuitBreaker = this.circuitBreakers.get(provider);
      if (circuitBreaker?.opened) {
        this.logger.warn(`Skipping ${provider} - circuit breaker is open`);
        continue;
      }

      try {
        const result = await circuitBreaker?.fire('download', key);
        if (result?.success) {
          return result;
        }
      } catch (error) {
        this.logger.warn(`Download failed on ${provider}: ${error.message}`);
        continue;
      }
    }

    throw new Error('All storage providers failed');
  }

  private async executeOperation(provider: CloudProvider, operation: string, ...args: any[]): Promise<any> {
    const startTime = Date.now();
    
    try {
      switch (operation) {
        case 'upload':
          return await this.performUpload(provider, ...args);
        case 'download':
          return await this.performDownload(provider, ...args);
        case 'delete':
          return await this.performDelete(provider, ...args);
        case 'health':
          return await this.performHealthCheck(provider);
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    } finally {
      const duration = Date.now() - startTime;
      this.emit('operationCompleted', { provider, operation, duration });
    }
  }

  private async performUpload(
    provider: CloudProvider,
    key: string,
    data: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    const client = this.providers.get(provider);
    
    switch (provider) {
      case CloudProvider.AWS_S3:
        const s3Result = await client.upload({
          Bucket: this.getProviderConfig(provider).bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
          Metadata: metadata || {},
        }).promise();

        return {
          success: true,
          provider,
          key,
          url: s3Result.Location,
          etag: s3Result.ETag,
          size: data.length,
        };

      case CloudProvider.GOOGLE_CLOUD:
        const bucket = client.bucket(this.getProviderConfig(provider).bucket);
        const file = bucket.file(key);
        
        await file.save(data, {
          metadata: {
            contentType,
            ...metadata,
          },
        });

        return {
          success: true,
          provider,
          key,
          url: `https://storage.googleapis.com/${this.getProviderConfig(provider).bucket}/${key}`,
          size: data.length,
        };

      case CloudProvider.AZURE_BLOB:
        const containerClient = client.getContainerClient(this.getProviderConfig(provider).bucket);
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        
        await blockBlobClient.upload(data, data.length, {
          blobHTTPHeaders: { blobContentType: contentType },
          metadata,
        });

        return {
          success: true,
          provider,
          key,
          url: blockBlobClient.url,
          size: data.length,
        };

      default:
        throw new Error(`Unsupported provider for upload: ${provider}`);
    }
  }

  private async performDownload(provider: CloudProvider, key: string): Promise<DownloadResult> {
    const client = this.providers.get(provider);
    
    switch (provider) {
      case CloudProvider.AWS_S3:
        const s3Result = await client.getObject({
          Bucket: this.getProviderConfig(provider).bucket,
          Key: key,
        }).promise();

        return {
          success: true,
          provider,
          data: s3Result.Body as Buffer,
          contentType: s3Result.ContentType,
          metadata: s3Result.Metadata || {},
        };

      case CloudProvider.GOOGLE_CLOUD:
        const bucket = client.bucket(this.getProviderConfig(provider).bucket);
        const file = bucket.file(key);
        const [contents, metadata] = await file.get();

        return {
          success: true,
          provider,
          data: contents,
          contentType: metadata.contentType,
          metadata: metadata.metadata || {},
        };

      case CloudProvider.AZURE_BLOB:
        const containerClient = client.getContainerClient(this.getProviderConfig(provider).bucket);
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        const downloadResponse = await blockBlobClient.download();

        return {
          success: true,
          provider,
          data: downloadResponse.readableStreamBody,
          contentType: downloadResponse.contentType,
          metadata: downloadResponse.metadata || {},
        };

      default:
        throw new Error(`Unsupported provider for download: ${provider}`);
    }
  }

  private async performDelete(provider: CloudProvider, key: string): Promise<boolean> {
    const client = this.providers.get(provider);
    
    switch (provider) {
      case CloudProvider.AWS_S3:
        await client.deleteObject({
          Bucket: this.getProviderConfig(provider).bucket,
          Key: key,
        }).promise();
        return true;

      case CloudProvider.GOOGLE_CLOUD:
        const bucket = client.bucket(this.getProviderConfig(provider).bucket);
        await bucket.file(key).delete();
        return true;

      case CloudProvider.AZURE_BLOB:
        const containerClient = client.getContainerClient(this.getProviderConfig(provider).bucket);
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        await blockBlobClient.delete();
        return true;

      default:
        throw new Error(`Unsupported provider for delete: ${provider}`);
    }
  }

  private async performHealthCheck(provider: CloudProvider): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      switch (provider) {
        case CloudProvider.AWS_S3:
          await this.providers.get(provider).listBuckets().promise();
          break;

        case CloudProvider.GOOGLE_CLOUD:
          await this.providers.get(provider).getBuckets();
          break;

        case CloudProvider.AZURE_BLOB:
          await this.providers.get(provider).listContainers().byPage().next();
          break;

        default:
          throw new Error(`Unsupported provider for health check: ${provider}`);
      }

      const latency = Date.now() - startTime;
      const healthCheck: HealthCheck = {
        provider,
        healthy: true,
        latency,
        lastChecked: new Date(),
      };

      this.healthStatus.set(provider, healthCheck);
      return healthCheck;

    } catch (error) {
      const latency = Date.now() - startTime;
      const healthCheck: HealthCheck = {
        provider,
        healthy: false,
        latency,
        error: error.message,
        lastChecked: new Date(),
      };

      this.healthStatus.set(provider, healthCheck);
      return healthCheck;
    }
  }

  private startHealthChecks(): void {
    const interval = setInterval(async () => {
      for (const provider of this.providers.keys()) {
        try {
          await this.performHealthCheck(provider);
        } catch (error) {
          this.logger.error(`Health check failed for ${provider}: ${error.message}`);
        }
      }
    }, 30000); // Check every 30 seconds

    // Cleanup on process exit
    process.on('SIGTERM', () => clearInterval(interval));
    process.on('SIGINT', () => clearInterval(interval));
  }

  private getProviderConfigs(): Record<CloudProvider, StorageConfig> {
    return {
      [CloudProvider.AWS_S3]: {
        provider: CloudProvider.AWS_S3,
        region: this.configService.get('AWS_S3_REGION') || 'us-east-1',
        bucket: this.configService.get('AWS_S3_BUCKET') || 'propchain-storage',
        credentials: {
          accessKeyId: this.configService.get('AWS_S3_ACCESS_KEY_ID'),
          secretAccessKey: this.configService.get('AWS_S3_SECRET_ACCESS_KEY'),
        },
        endpoint: this.configService.get('AWS_S3_ENDPOINT'),
        forcePathStyle: this.configService.get('AWS_S3_FORCE_PATH_STYLE') === 'true',
        retryAttempts: parseInt(this.configService.get('AWS_S3_RETRY_ATTEMPTS') || '3'),
        timeout: parseInt(this.configService.get('AWS_S3_TIMEOUT') || '30000'),
      },
      [CloudProvider.GOOGLE_CLOUD]: {
        provider: CloudProvider.GOOGLE_CLOUD,
        region: this.configService.get('GOOGLE_CLOUD_REGION') || 'us-central1',
        bucket: this.configService.get('GOOGLE_CLOUD_BUCKET') || 'propchain-storage',
        credentials: {
          keyFilename: this.configService.get('GOOGLE_CLOUD_KEY_FILE'),
        },
        retryAttempts: parseInt(this.configService.get('GOOGLE_CLOUD_RETRY_ATTEMPTS') || '3'),
        timeout: parseInt(this.configService.get('GOOGLE_CLOUD_TIMEOUT') || '30000'),
      },
      [CloudProvider.AZURE_BLOB]: {
        provider: CloudProvider.AZURE_BLOB,
        region: this.configService.get('AZURE_REGION') || 'eastus',
        bucket: this.configService.get('AZURE_STORAGE_CONTAINER') || 'propchain-storage',
        credentials: {
          clientId: this.configService.get('AZURE_STORAGE_ACCOUNT_NAME'),
          clientSecret: this.configService.get('AZURE_STORAGE_ACCOUNT_KEY'),
        },
        retryAttempts: parseInt(this.configService.get('AZURE_RETRY_ATTEMPTS') || '3'),
        timeout: parseInt(this.configService.get('AZURE_TIMEOUT') || '30000'),
      },
    };
  }

  private getProviderConfig(provider: CloudProvider): StorageConfig {
    const configs = this.getProviderConfigs();
    const config = configs[provider];
    
    if (!config) {
      throw new Error(`No configuration found for provider: ${provider}`);
    }
    
    return config;
  }

  getHealthStatus(): Map<CloudProvider, HealthCheck> {
    return new Map(this.healthStatus);
  }

  getAvailableProviders(): CloudProvider[] {
    return Array.from(this.providers.keys());
  }

  isProviderHealthy(provider: CloudProvider): boolean {
    const health = this.healthStatus.get(provider);
    return health?.healthy || false;
  }

  getPrimaryProvider(): CloudProvider {
    return this.primaryProvider;
  }

  getFailoverProviders(): CloudProvider[] {
    return [...this.failoverProviders];
  }
}
