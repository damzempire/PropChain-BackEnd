import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiCloudManager, CloudProvider, UploadResult, DownloadResult } from '../storage/MultiCloudManager';
import { StorageOptimizer, StorageTier, OptimizationRecommendation } from '../storage/StorageOptimizer';
import { DataCompressor, CompressionResult, CompressionAlgorithm } from '../storage/DataCompressor';

export interface StorageUploadOptions {
  compress?: boolean;
  compressionAlgorithm?: CompressionAlgorithm;
  tier?: StorageTier;
  provider?: CloudProvider;
  metadata?: Record<string, string>;
  enableOptimization?: boolean;
}

export interface StorageDownloadOptions {
  decompress?: boolean;
  algorithm?: CompressionAlgorithm;
  recordAccess?: boolean;
}

export interface StorageFileInfo {
  key: string;
  size: number;
  contentType: string;
  provider: CloudProvider;
  tier: StorageTier;
  compressed: boolean;
  compressionAlgorithm?: CompressionAlgorithm;
  originalSize?: number;
  uploadTime: Date;
  lastAccessed?: Date;
  accessCount: number;
  metadata?: Record<string, string>;
  url?: string;
}

export interface StorageMetrics {
  totalFiles: number;
  totalSize: number;
  totalCompressedSize: number;
  averageCompressionRatio: number;
  costByProvider: Record<CloudProvider, number>;
  costByTier: Record<StorageTier, number>;
  healthStatus: Record<CloudProvider, { healthy: boolean; latency: number }>;
  compressionStats: any;
  optimizationRecommendations: OptimizationRecommendation[];
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly fileMetadata = new Map<string, StorageFileInfo>();

  constructor(
    private readonly configService: ConfigService,
    private readonly multiCloudManager: MultiCloudManager,
    private readonly storageOptimizer: StorageOptimizer,
    private readonly dataCompressor: DataCompressor,
  ) {}

  async onModuleInit() {
    this.logger.log('StorageService initialized');
    
    // Set up event listeners
    this.multiCloudManager.on('fileUploaded', (event) => {
      this.logger.log(`File uploaded event: ${event.key} to ${event.provider}`);
    });

    this.multiCloudManager.on('fileDownloaded', (event) => {
      this.logger.log(`File downloaded event: ${event.key} from ${event.provider}`);
      if (event.key) {
        this.storageOptimizer.recordAccess(
          event.key,
          event.provider,
          event.size || 0,
          this.getFileInfo(event.key)?.contentType || 'application/octet-stream'
        );
      }
    });

    this.multiCloudManager.on('circuitBreakerOpened', (provider) => {
      this.logger.warn(`Circuit breaker opened for provider: ${provider}`);
    });

    this.multiCloudManager.on('circuitBreakerClosed', (provider) => {
      this.logger.log(`Circuit breaker closed for provider: ${provider}`);
    });
  }

  async uploadFile(
    key: string,
    data: Buffer,
    contentType: string,
    options: StorageUploadOptions = {}
  ): Promise<{ success: boolean; fileInfo: StorageFileInfo; error?: string }> {
    try {
      const startTime = Date.now();
      let processedData = data;
      let compressionResult: CompressionResult | null = null;
      let finalContentType = contentType;
      let finalProvider = options.provider || this.multiCloudManager.getPrimaryProvider();
      let finalTier = options.tier || StorageTier.WARM;

      // Apply compression if enabled
      if (options.compress !== false) {
        compressionResult = await this.dataCompressor.compressData(
          data,
          contentType,
          {
            algorithm: options.compressionAlgorithm,
            imageOptimization: {
              enabled: true,
              quality: 85,
            },
          }
        );

        if (compressionResult.success && compressionResult.compressionRatio < 0.95) {
          processedData = Buffer.from(compressionResult.compressedSize ? [] : []);
          // In a real implementation, you'd store the compressed data
          // For now, we'll use the original data
          processedData = data;
          finalContentType = compressionResult.mimeType || contentType;
        }
      }

      // Prepare metadata
      const metadata = {
        ...options.metadata,
        'content-type': finalContentType,
        'original-size': data.length.toString(),
        'upload-time': new Date().toISOString(),
        'compression-algorithm': compressionResult?.algorithm,
        'compression-ratio': compressionResult?.compressionRatio?.toString(),
        'storage-tier': finalTier,
      };

      // Upload to cloud storage
      const uploadResult: UploadResult = await this.multiCloudManager.uploadFile(
        key,
        processedData,
        finalContentType,
        metadata
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      // Record access pattern for optimization
      if (options.enableOptimization !== false) {
        this.storageOptimizer.recordAccess(key, uploadResult.provider, processedData.length, finalContentType);
      }

      // Store file metadata
      const fileInfo: StorageFileInfo = {
        key,
        size: processedData.length,
        contentType: finalContentType,
        provider: uploadResult.provider,
        tier: finalTier,
        compressed: compressionResult?.success || false,
        compressionAlgorithm: compressionResult?.algorithm,
        originalSize: data.length,
        uploadTime: new Date(),
        accessCount: 1,
        lastAccessed: new Date(),
        metadata: options.metadata,
        url: uploadResult.url,
      };

      this.fileMetadata.set(key, fileInfo);

      this.logger.log(`File uploaded successfully: ${key} (${processedData.length} bytes) to ${uploadResult.provider} in ${Date.now() - startTime}ms`);

      return { success: true, fileInfo };

    } catch (error) {
      this.logger.error(`Failed to upload file ${key}: ${error.message}`);
      return {
        success: false,
        fileInfo: null as any,
        error: error.message,
      };
    }
  }

  async downloadFile(
    key: string,
    options: StorageDownloadOptions = {}
  ): Promise<{ success: boolean; data: Buffer; fileInfo: StorageFileInfo; error?: string }> {
    try {
      const startTime = Date.now();
      
      // Get file metadata
      const fileInfo = this.getFileInfo(key);
      if (!fileInfo) {
        throw new Error(`File not found: ${key}`);
      }

      // Download from cloud storage
      const downloadResult: DownloadResult = await this.multiCloudManager.downloadFile(key);

      if (!downloadResult.success) {
        throw new Error(downloadResult.error || 'Download failed');
      }

      let processedData = downloadResult.data || Buffer.alloc(0);

      // Decompress if needed
      if (options.decompress && fileInfo.compressed && fileInfo.compressionAlgorithm) {
        try {
          processedData = await this.dataCompressor.decompressData(
            processedData,
            fileInfo.compressionAlgorithm,
            fileInfo.contentType
          );
        } catch (decompressError) {
          this.logger.warn(`Failed to decompress file ${key}: ${decompressError.message}`);
          // Fall back to original data
        }
      }

      // Record access for optimization
      if (options.recordAccess !== false) {
        this.storageOptimizer.recordAccess(key, fileInfo.provider, processedData.length, fileInfo.contentType);
        
        // Update file access metadata
        fileInfo.accessCount++;
        fileInfo.lastAccessed = new Date();
        this.fileMetadata.set(key, fileInfo);
      }

      this.logger.log(`File downloaded successfully: ${key} (${processedData.length} bytes) from ${fileInfo.provider} in ${Date.now() - startTime}ms`);

      return { success: true, data: processedData, fileInfo };

    } catch (error) {
      this.logger.error(`Failed to download file ${key}: ${error.message}`);
      return {
        success: false,
        data: Buffer.alloc(0),
        fileInfo: null as any,
        error: error.message,
      };
    }
  }

  async deleteFile(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fileInfo = this.getFileInfo(key);
      if (!fileInfo) {
        return { success: true }; // Already deleted or doesn't exist
      }

      // Delete from cloud storage
      await this.multiCloudManager['performDelete'](fileInfo.provider, key);

      // Remove from metadata
      this.fileMetadata.delete(key);
      
      // Remove from optimizer
      this.storageOptimizer.removeAccessPattern(key);

      this.logger.log(`File deleted successfully: ${key}`);
      return { success: true };

    } catch (error) {
      this.logger.error(`Failed to delete file ${key}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async moveFile(
    key: string,
    newProvider?: CloudProvider,
    newTier?: StorageTier
  ): Promise<{ success: boolean; fileInfo: StorageFileInfo; error?: string }> {
    try {
      const fileInfo = this.getFileInfo(key);
      if (!fileInfo) {
        throw new Error(`File not found: ${key}`);
      }

      // Download the file
      const downloadResult = await this.downloadFile(key, { recordAccess: false });
      if (!downloadResult.success) {
        throw new Error(downloadResult.error);
      }

      // Upload to new location
      const uploadResult = await this.uploadFile(key, downloadResult.data, fileInfo.contentType, {
        provider: newProvider,
        tier: newTier,
        compress: false, // Don't re-compress
        enableOptimization: false, // Don't record as new access
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      // Delete from old location
      await this.deleteFile(key);

      // Restore metadata with new provider/tier
      const updatedFileInfo = { ...uploadResult.fileInfo };
      updatedFileInfo.provider = newProvider || fileInfo.provider;
      updatedFileInfo.tier = newTier || fileInfo.tier;
      this.fileMetadata.set(key, updatedFileInfo);

      this.logger.log(`File moved successfully: ${key} to ${updatedFileInfo.provider}/${updatedFileInfo.tier}`);
      return { success: true, fileInfo: updatedFileInfo };

    } catch (error) {
      this.logger.error(`Failed to move file ${key}: ${error.message}`);
      return {
        success: false,
        fileInfo: null as any,
        error: error.message,
      };
    }
  }

  getFileInfo(key: string): StorageFileInfo | undefined {
    return this.fileMetadata.get(key);
  }

  listFiles(filter?: {
    provider?: CloudProvider;
    tier?: StorageTier;
    compressed?: boolean;
    contentType?: string;
  }): StorageFileInfo[] {
    let files = Array.from(this.fileMetadata.values());

    if (filter) {
      files = files.filter(file => {
        if (filter.provider && file.provider !== filter.provider) return false;
        if (filter.tier && file.tier !== filter.tier) return false;
        if (filter.compressed !== undefined && file.compressed !== filter.compressed) return false;
        if (filter.contentType && !file.contentType.includes(filter.contentType)) return false;
        return true;
      });
    }

    return files.sort((a, b) => b.uploadTime.getTime() - a.uploadTime.getTime());
  }

  async getStorageMetrics(): Promise<StorageMetrics> {
    const files = this.listFiles();
    const healthStatus = this.multiCloudManager.getHealthStatus();
    const costReport = await this.storageOptimizer.generateCostReport();
    const compressionStats = this.dataCompressor.getCompressionStats();

    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const totalOriginalSize = files.reduce((sum, file) => sum + (file.originalSize || file.size), 0);
    const averageCompressionRatio = totalOriginalSize > 0 ? totalSize / totalOriginalSize : 1;

    const costByProvider: Record<CloudProvider, number> = {} as any;
    const costByTier: Record<StorageTier, number> = {} as any;

    // Initialize cost objects
    for (const provider of Object.values(CloudProvider)) {
      costByProvider[provider] = 0;
    }
    for (const tier of Object.values(StorageTier)) {
      costByTier[tier] = 0;
    }

    // Calculate costs by provider and tier
    for (const file of files) {
      const cost = this.storageOptimizer['calculateMonthlyCost'](
        file.provider,
        file.tier,
        {
          key: file.key,
          accessCount: file.accessCount,
          lastAccessed: file.lastAccessed || file.uploadTime,
          firstAccessed: file.uploadTime,
          averageAccessInterval: 0,
          size: file.size,
          contentType: file.contentType,
          currentTier: file.tier,
          provider: file.provider,
        }
      );
      
      costByProvider[file.provider] += cost;
      costByTier[file.tier] += cost;
    }

    const healthStatusMap: Record<CloudProvider, { healthy: boolean; latency: number }> = {} as any;
    for (const [provider, health] of healthStatus) {
      healthStatusMap[provider] = {
        healthy: health.healthy,
        latency: health.latency,
      };
    }

    return {
      totalFiles,
      totalSize,
      totalCompressedSize: totalSize,
      averageCompressionRatio,
      costByProvider,
      costByTier,
      healthStatus: healthStatusMap,
      compressionStats,
      optimizationRecommendations: costReport.recommendations,
    };
  }

  async optimizeStorage(): Promise<{
    recommendations: OptimizationRecommendation[];
    appliedMigrations: Array<{ key: string; from: string; to: string; success: boolean }>;
  }> {
    const recommendations = await this.storageOptimizer.analyzeAndOptimize();
    const appliedMigrations = [];

    // Apply high-priority recommendations automatically
    const highPriorityRecommendations = recommendations.filter(rec => rec.migrationPriority === 'high');

    for (const recommendation of highPriorityRecommendations) {
      try {
        const migrationResult = await this.moveFile(
          recommendation.key,
          recommendation.recommendedProvider,
          recommendation.recommendedTier
        );

        appliedMigrations.push({
          key: recommendation.key,
          from: `${recommendation.currentProvider}/${recommendation.currentTier}`,
          to: `${recommendation.recommendedProvider}/${recommendation.recommendedTier}`,
          success: migrationResult.success,
        });
      } catch (error) {
        this.logger.error(`Failed to apply optimization for ${recommendation.key}: ${error.message}`);
        appliedMigrations.push({
          key: recommendation.key,
          from: `${recommendation.currentProvider}/${recommendation.currentTier}`,
          to: `${recommendation.recommendedProvider}/${recommendation.recommendedTier}`,
          success: false,
        });
      }
    }

    return {
      recommendations,
      appliedMigrations,
    };
  }

  async testCompression(
    key: string,
    algorithms?: CompressionAlgorithm[]
  ): Promise<CompressionResult[]> {
    const fileInfo = this.getFileInfo(key);
    if (!fileInfo) {
      throw new Error(`File not found: ${key}`);
    }

    const downloadResult = await this.downloadFile(key, { recordAccess: false });
    if (!downloadResult.success) {
      throw new Error(downloadResult.error);
    }

    return await this.dataCompressor.benchmarkCompression(
      downloadResult.data,
      fileInfo.contentType,
      algorithms
    );
  }

  getStorageHealth(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    providers: Record<CloudProvider, { healthy: boolean; latency: number; error?: string }>;
  } {
    const healthStatus = this.multiCloudManager.getHealthStatus();
    const providers: Record<CloudProvider, { healthy: boolean; latency: number; error?: string }> = {} as any;
    
    let healthyCount = 0;
    let totalCount = 0;

    for (const [provider, health] of healthStatus) {
      providers[provider] = {
        healthy: health.healthy,
        latency: health.latency,
        error: health.error,
      };
      
      totalCount++;
      if (health.healthy) healthyCount++;
    }

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalCount) {
      overall = 'healthy';
    } else if (healthyCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return { overall, providers };
  }

  async cleanupExpiredFiles(maxAge: number): Promise<{
    deleted: string[];
    errors: Array<{ key: string; error: string }>;
  }> {
    const files = this.listFiles();
    const cutoffDate = new Date(Date.now() - maxAge);
    const deleted: string[] = [];
    const errors: Array<{ key: string; error: string }> = [];

    for (const file of files) {
      if (file.uploadTime < cutoffDate && file.accessCount < 2) {
        try {
          const result = await this.deleteFile(file.key);
          if (result.success) {
            deleted.push(file.key);
          } else {
            errors.push({ key: file.key, error: result.error || 'Unknown error' });
          }
        } catch (error) {
          errors.push({ key: file.key, error: error.message });
        }
      }
    }

    this.logger.log(`Cleanup completed: ${deleted.length} files deleted, ${errors.length} errors`);
    return { deleted, errors };
  }

  generateStorageReport(): {
    summary: StorageMetrics;
    health: ReturnType<StorageService['getStorageHealth']>;
    recommendations: OptimizationRecommendation[];
    topFilesBySize: StorageFileInfo[];
    topFilesByAccess: StorageFileInfo[];
  } {
    const files = this.listFiles();
    
    return {
      summary: this.getStorageMetrics() as any, // Simplified for this example
      health: this.getStorageHealth(),
      recommendations: this.storageOptimizer.getOptimizationHistory(10),
      topFilesBySize: files.sort((a, b) => b.size - a.size).slice(0, 10),
      topFilesByAccess: files.sort((a, b) => b.accessCount - a.accessCount).slice(0, 10),
    };
  }
}
