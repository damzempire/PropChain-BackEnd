export interface MultiCloudStorageConfig {
  // Primary and failover providers
  STORAGE_PRIMARY_PROVIDER: 'aws_s3' | 'google_cloud' | 'azure_blob';
  STORAGE_FAILOVER_PROVIDERS: string[];

  // AWS S3 Configuration
  AWS_S3_ACCESS_KEY_ID?: string;
  AWS_S3_SECRET_ACCESS_KEY?: string;
  AWS_S3_REGION: string;
  AWS_S3_BUCKET: string;
  AWS_S3_ENDPOINT?: string;
  AWS_S3_FORCE_PATH_STYLE: boolean;
  AWS_S3_RETRY_ATTEMPTS: number;
  AWS_S3_TIMEOUT: number;

  // Google Cloud Storage Configuration
  GOOGLE_CLOUD_PROJECT_ID?: string;
  GOOGLE_CLOUD_KEY_FILE?: string;
  GOOGLE_CLOUD_REGION: string;
  GOOGLE_CLOUD_BUCKET: string;
  GOOGLE_CLOUD_RETRY_ATTEMPTS: number;
  GOOGLE_CLOUD_TIMEOUT: number;

  // Azure Blob Storage Configuration
  AZURE_STORAGE_ACCOUNT_NAME?: string;
  AZURE_STORAGE_ACCOUNT_KEY?: string;
  AZURE_STORAGE_CONTAINER: string;
  AZURE_REGION: string;
  AZURE_RETRY_ATTEMPTS: number;
  AZURE_TIMEOUT: number;

  // Compression Settings
  COMPRESSION_ENABLED: boolean;
  COMPRESSION_ALGORITHM: 'gzip' | 'deflate' | 'brotli' | 'lz4' | 'none';
  COMPRESSION_LEVEL: number;
  COMPRESSION_THRESHOLD: number;

  // Image Optimization
  IMAGE_OPTIMIZATION_ENABLED: boolean;
  IMAGE_DEFAULT_FORMAT: 'jpeg' | 'png' | 'webp' | 'avif' | 'original';
  IMAGE_DEFAULT_QUALITY: number;
  IMAGE_REMOVE_METADATA: boolean;

  // Storage Tiering
  STORAGE_TIERING_ENABLED: boolean;
  STORAGE_OPTIMIZATION_INTERVAL: number; // in minutes
  STORAGE_DEFAULT_TIER: 'hot' | 'warm' | 'cold' | 'archive';

  // Cost Optimization
  COST_OPTIMIZATION_ENABLED: boolean;
  COST_ANALYSIS_INTERVAL: number; // in minutes

  // Health Monitoring
  HEALTH_CHECK_INTERVAL: number; // in seconds
  CIRCUIT_BREAKER_THRESHOLD: number; // percentage
  CIRCUIT_BREAKER_TIMEOUT: number; // in milliseconds
}

export default (): MultiCloudStorageConfig => ({
  // Primary and failover providers
  STORAGE_PRIMARY_PROVIDER: (process.env.STORAGE_PRIMARY_PROVIDER as any) || 'aws_s3',
  STORAGE_FAILOVER_PROVIDERS: process.env.STORAGE_FAILOVER_PROVIDERS?.split(',') || ['google_cloud', 'azure_blob'],

  // AWS S3 Configuration
  AWS_S3_ACCESS_KEY_ID: process.env.AWS_S3_ACCESS_KEY_ID,
  AWS_S3_SECRET_ACCESS_KEY: process.env.AWS_S3_SECRET_ACCESS_KEY,
  AWS_S3_REGION: process.env.AWS_S3_REGION || 'us-east-1',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || 'propchain-storage',
  AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT,
  AWS_S3_FORCE_PATH_STYLE: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
  AWS_S3_RETRY_ATTEMPTS: parseInt(process.env.AWS_S3_RETRY_ATTEMPTS || '3'),
  AWS_S3_TIMEOUT: parseInt(process.env.AWS_S3_TIMEOUT || '30000'),

  // Google Cloud Storage Configuration
  GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
  GOOGLE_CLOUD_KEY_FILE: process.env.GOOGLE_CLOUD_KEY_FILE,
  GOOGLE_CLOUD_REGION: process.env.GOOGLE_CLOUD_REGION || 'us-central1',
  GOOGLE_CLOUD_BUCKET: process.env.GOOGLE_CLOUD_BUCKET || 'propchain-storage',
  GOOGLE_CLOUD_RETRY_ATTEMPTS: parseInt(process.env.GOOGLE_CLOUD_RETRY_ATTEMPTS || '3'),
  GOOGLE_CLOUD_TIMEOUT: parseInt(process.env.GOOGLE_CLOUD_TIMEOUT || '30000'),

  // Azure Blob Storage Configuration
  AZURE_STORAGE_ACCOUNT_NAME: process.env.AZURE_STORAGE_ACCOUNT_NAME,
  AZURE_STORAGE_ACCOUNT_KEY: process.env.AZURE_STORAGE_ACCOUNT_KEY,
  AZURE_STORAGE_CONTAINER: process.env.AZURE_STORAGE_CONTAINER || 'propchain-storage',
  AZURE_REGION: process.env.AZURE_REGION || 'eastus',
  AZURE_RETRY_ATTEMPTS: parseInt(process.env.AZURE_RETRY_ATTEMPTS || '3'),
  AZURE_TIMEOUT: parseInt(process.env.AZURE_TIMEOUT || '30000'),

  // Compression Settings
  COMPRESSION_ENABLED: process.env.COMPRESSION_ENABLED !== 'false',
  COMPRESSION_ALGORITHM: (process.env.COMPRESSION_ALGORITHM as any) || 'gzip',
  COMPRESSION_LEVEL: parseInt(process.env.COMPRESSION_LEVEL || '6'),
  COMPRESSION_THRESHOLD: parseInt(process.env.COMPRESSION_THRESHOLD || '1024'),

  // Image Optimization
  IMAGE_OPTIMIZATION_ENABLED: process.env.IMAGE_OPTIMIZATION_ENABLED !== 'false',
  IMAGE_DEFAULT_FORMAT: (process.env.IMAGE_DEFAULT_FORMAT as any) || 'webp',
  IMAGE_DEFAULT_QUALITY: parseInt(process.env.IMAGE_DEFAULT_QUALITY || '85'),
  IMAGE_REMOVE_METADATA: process.env.IMAGE_REMOVE_METADATA !== 'false',

  // Storage Tiering
  STORAGE_TIERING_ENABLED: process.env.STORAGE_TIERING_ENABLED !== 'false',
  STORAGE_OPTIMIZATION_INTERVAL: parseInt(process.env.STORAGE_OPTIMIZATION_INTERVAL || '60'), // 60 minutes
  STORAGE_DEFAULT_TIER: (process.env.STORAGE_DEFAULT_TIER as any) || 'warm',

  // Cost Optimization
  COST_OPTIMIZATION_ENABLED: process.env.COST_OPTIMIZATION_ENABLED !== 'false',
  COST_ANALYSIS_INTERVAL: parseInt(process.env.COST_ANALYSIS_INTERVAL || '120'), // 120 minutes

  // Health Monitoring
  HEALTH_CHECK_INTERVAL: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30'), // 30 seconds
  CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '50'), // 50%
  CIRCUIT_BREAKER_TIMEOUT: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000'), // 60 seconds
});
