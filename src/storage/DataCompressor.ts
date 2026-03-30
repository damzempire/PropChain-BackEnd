import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as zlib from 'zlib';
import * as sharp from 'sharp';
import { promisify } from 'util';

export enum CompressionAlgorithm {
  GZIP = 'gzip',
  DEFLATE = 'deflate',
  BROTLI = 'brotli',
  LZ4 = 'lz4',
  NONE = 'none',
}

export enum ImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  AVIF = 'avif',
  ORIGINAL = 'original',
}

export interface CompressionOptions {
  algorithm: CompressionAlgorithm;
  level?: number; // 1-9 for gzip/deflate, 1-11 for brotli
  threshold?: number; // Minimum size in bytes to compress
  excludeMimeTypes?: string[];
  imageOptimization?: {
    enabled: boolean;
    format?: ImageFormat;
    quality?: number; // 1-100
    resize?: {
      width?: number;
      height?: number;
      fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    };
    removeMetadata?: boolean;
  };
}

export interface CompressionResult {
  success: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  algorithm: CompressionAlgorithm;
  processingTime: number;
  mimeType?: string;
  error?: string;
  metadata?: {
    format?: string;
    width?: number;
    height?: number;
    channels?: number;
    hasAlpha?: boolean;
  };
}

export interface CompressionStats {
  totalFiles: number;
  totalOriginalSize: number;
  totalCompressedSize: number;
  averageCompressionRatio: number;
  totalProcessingTime: number;
  algorithmUsage: Record<CompressionAlgorithm, number>;
  formatConversions: Record<string, number>;
}

@Injectable()
export class DataCompressor {
  private readonly logger = new Logger(DataCompressor.name);
  private readonly gzipAsync = promisify(zlib.gzip);
  private readonly deflateAsync = promisify(zlib.deflate);
  private readonly brotliAsync = promisify(zlib.brotliCompress);
  private readonly stats: CompressionStats = {
    totalFiles: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    averageCompressionRatio: 0,
    totalProcessingTime: 0,
    algorithmUsage: {} as Record<CompressionAlgorithm, number>,
    formatConversions: {},
  };

  constructor(private readonly configService: ConfigService) {
    this.initializeAlgorithmStats();
  }

  private initializeAlgorithmStats(): void {
    for (const algorithm of Object.values(CompressionAlgorithm)) {
      this.stats.algorithmUsage[algorithm] = 0;
    }
  }

  async compressData(
    data: Buffer,
    mimeType: string,
    options?: Partial<CompressionOptions>
  ): Promise<CompressionResult> {
    const startTime = Date.now();
    const defaultOptions = this.getDefaultCompressionOptions();
    const finalOptions = { ...defaultOptions, ...options };

    try {
      // Skip compression if below threshold
      if (data.length < (finalOptions.threshold || 1024)) {
        return this.createUncompressedResult(data, mimeType, startTime);
      }

      // Skip excluded MIME types
      if (finalOptions.excludeMimeTypes?.includes(mimeType)) {
        return this.createUncompressedResult(data, mimeType, startTime);
      }

      let compressedData: Buffer;
      let finalMimeType = mimeType;
      let metadata: any;

      // Handle image optimization
      if (this.isImageMimeType(mimeType) && finalOptions.imageOptimization?.enabled) {
        const imageResult = await this.optimizeImage(data, mimeType, finalOptions.imageOptimization);
        compressedData = imageResult.data;
        finalMimeType = imageResult.mimeType;
        metadata = imageResult.metadata;
        
        // Update format conversion stats
        if (mimeType !== finalMimeType) {
          const conversion = `${mimeType}->${finalMimeType}`;
          this.stats.formatConversions[conversion] = (this.stats.formatConversions[conversion] || 0) + 1;
        }
      } else {
        compressedData = data;
      }

      // Apply compression algorithm
      if (finalOptions.algorithm !== CompressionAlgorithm.NONE) {
        compressedData = await this.applyCompressionAlgorithm(compressedData, finalOptions);
      }

      const processingTime = Date.now() - startTime;
      const result: CompressionResult = {
        success: true,
        originalSize: data.length,
        compressedSize: compressedData.length,
        compressionRatio: data.length > 0 ? compressedData.length / data.length : 1,
        algorithm: finalOptions.algorithm,
        processingTime,
        mimeType: finalMimeType,
        metadata,
      };

      this.updateStats(result);
      return result;

    } catch (error) {
      this.logger.error(`Compression failed: ${error.message}`);
      return {
        success: false,
        originalSize: data.length,
        compressedSize: data.length,
        compressionRatio: 1,
        algorithm: finalOptions.algorithm || CompressionAlgorithm.NONE,
        processingTime: Date.now() - startTime,
        mimeType,
        error: error.message,
      };
    }
  }

  async decompressData(
    compressedData: Buffer,
    algorithm: CompressionAlgorithm,
    originalMimeType?: string
  ): Promise<Buffer> {
    try {
      switch (algorithm) {
        case CompressionAlgorithm.GZIP:
          return await promisify(zlib.gunzip)(compressedData);
        
        case CompressionAlgorithm.DEFLATE:
          return await promisify(zlib.inflate)(compressedData);
        
        case CompressionAlgorithm.BROTLI:
          return await promisify(zlib.brotliDecompress)(compressedData);
        
        case CompressionAlgorithm.NONE:
        default:
          return compressedData;
      }
    } catch (error) {
      this.logger.error(`Decompression failed for ${algorithm}: ${error.message}`);
      throw new Error(`Failed to decompress data: ${error.message}`);
    }
  }

  private async applyCompressionAlgorithm(
    data: Buffer,
    options: CompressionOptions
  ): Promise<Buffer> {
    const level = options.level || this.getDefaultCompressionLevel(options.algorithm);

    switch (options.algorithm) {
      case CompressionAlgorithm.GZIP:
        return await this.gzipAsync(data, { level });
      
      case CompressionAlgorithm.DEFLATE:
        return await this.deflateAsync(data, { level });
      
      case CompressionAlgorithm.BROTLI:
        return await this.brotliAsync(data, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: level,
          },
        });
      
      case CompressionAlgorithm.NONE:
      default:
        return data;
    }
  }

  private async optimizeImage(
    data: Buffer,
    mimeType: string,
    options: NonNullable<CompressionOptions['imageOptimization']>
  ): Promise<{ data: Buffer; mimeType: string; metadata: any }> {
    try {
      let sharpInstance = sharp(data);
      const metadata = await sharpInstance.metadata();

      // Apply resizing if specified
      if (options.resize) {
        sharpInstance = sharpInstance.resize(options.resize.width, options.resize.height, {
          fit: options.resize.fit || 'cover',
          withoutEnlargement: true,
        });
      }

      // Remove metadata if requested
      if (options.removeMetadata) {
        sharpInstance = sharpInstance.withoutMetadata();
      }

      // Determine output format
      const outputFormat = options.format || this.determineOptimalFormat(mimeType, metadata);
      
      // Apply format-specific optimizations
      switch (outputFormat) {
        case ImageFormat.JPEG:
          sharpInstance = sharpInstance.jpeg({
            quality: options.quality || 85,
            progressive: true,
            mozjpeg: true,
          });
          break;

        case ImageFormat.PNG:
          sharpInstance = sharpInstance.png({
            quality: options.quality || 90,
            progressive: true,
            compressionLevel: 9,
          });
          break;

        case ImageFormat.WEBP:
          sharpInstance = sharpInstance.webp({
            quality: options.quality || 85,
            effort: 6,
          });
          break;

        case ImageFormat.AVIF:
          sharpInstance = sharpInstance.avif({
            quality: options.quality || 85,
            effort: 6,
          });
          break;

        case ImageFormat.ORIGINAL:
        default:
          // Keep original format
          break;
      }

      const optimizedData = await sharpInstance.toBuffer();
      const outputMimeType = this.getOutputMimeType(outputFormat, mimeType);

      return {
        data: optimizedData,
        mimeType: outputMimeType,
        metadata: {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          channels: metadata.channels,
          hasAlpha: metadata.hasAlpha,
        },
      };

    } catch (error) {
      this.logger.warn(`Image optimization failed: ${error.message}`);
      return { data, mimeType, metadata: null };
    }
  }

  private determineOptimalFormat(currentMimeType: string, metadata: any): ImageFormat {
    // If image has transparency, PNG or WebP would be better
    if (metadata?.hasAlpha) {
      return ImageFormat.WEBP; // WebP supports transparency with better compression
    }

    // For photographs, WebP or AVIF provide better compression
    if (currentMimeType === 'image/jpeg') {
      return ImageFormat.WEBP;
    }

    // For graphics with limited colors, PNG might be better
    if (currentMimeType === 'image/png') {
      return ImageFormat.WEBP;
    }

    return ImageFormat.ORIGINAL;
  }

  private getOutputMimeType(format: ImageFormat, originalMimeType: string): string {
    switch (format) {
      case ImageFormat.JPEG:
        return 'image/jpeg';
      case ImageFormat.PNG:
        return 'image/png';
      case ImageFormat.WEBP:
        return 'image/webp';
      case ImageFormat.AVIF:
        return 'image/avif';
      case ImageFormat.ORIGINAL:
      default:
        return originalMimeType;
    }
  }

  private isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private createUncompressedResult(data: Buffer, mimeType: string, startTime: number): CompressionResult {
    return {
      success: true,
      originalSize: data.length,
      compressedSize: data.length,
      compressionRatio: 1,
      algorithm: CompressionAlgorithm.NONE,
      processingTime: Date.now() - startTime,
      mimeType,
    };
  }

  private updateStats(result: CompressionResult): void {
    this.stats.totalFiles++;
    this.stats.totalOriginalSize += result.originalSize;
    this.stats.totalCompressedSize += result.compressedSize;
    this.stats.totalProcessingTime += result.processingTime;
    this.stats.algorithmUsage[result.algorithm]++;
    
    this.stats.averageCompressionRatio = 
      this.stats.totalOriginalSize > 0 
        ? this.stats.totalCompressedSize / this.stats.totalOriginalSize
        : 1;
  }

  private getDefaultCompressionOptions(): CompressionOptions {
    return {
      algorithm: CompressionAlgorithm.GZIP,
      level: 6,
      threshold: 1024,
      excludeMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/quicktime',
        'application/zip',
        'application/x-tar',
        'application/gzip',
      ],
      imageOptimization: {
        enabled: true,
        format: ImageFormat.WEBP,
        quality: 85,
        removeMetadata: true,
      },
    };
  }

  private getDefaultCompressionLevel(algorithm: CompressionAlgorithm): number {
    switch (algorithm) {
      case CompressionAlgorithm.GZIP:
      case CompressionAlgorithm.DEFLATE:
        return 6;
      case CompressionAlgorithm.BROTLI:
        return 6;
      default:
        return 6;
    }
  }

  getCompressionStats(): CompressionStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats.totalFiles = 0;
    this.stats.totalOriginalSize = 0;
    this.stats.totalCompressedSize = 0;
    this.stats.averageCompressionRatio = 0;
    this.stats.totalProcessingTime = 0;
    this.stats.formatConversions = {};
    this.initializeAlgorithmStats();
  }

  async benchmarkCompression(
    data: Buffer,
    mimeType: string,
    algorithms?: CompressionAlgorithm[]
  ): Promise<CompressionResult[]> {
    const algorithmsToTest = algorithms || [
      CompressionAlgorithm.NONE,
      CompressionAlgorithm.GZIP,
      CompressionAlgorithm.DEFLATE,
      CompressionAlgorithm.BROTLI,
    ];

    const results: CompressionResult[] = [];

    for (const algorithm of algorithmsToTest) {
      const result = await this.compressData(data, mimeType, { algorithm });
      results.push(result);
    }

    return results.sort((a, b) => b.compressedSize - a.compressedSize);
  }

  async estimateCompressionRatio(
    sampleSize: number,
    mimeType: string
  ): Promise<number> {
    // Generate sample data for estimation
    const sampleData = Buffer.alloc(sampleSize, Math.random().toString());
    
    const result = await this.compressData(sampleData, mimeType);
    return result.compressionRatio;
  }

  getOptimalAlgorithmForMimeType(mimeType: string): CompressionAlgorithm {
    // For text-based content, Brotli usually provides the best compression
    if (mimeType.startsWith('text/') || 
        mimeType === 'application/json' ||
        mimeType === 'application/xml' ||
        mimeType === 'application/javascript') {
      return CompressionAlgorithm.BROTLI;
    }

    // For already compressed content, no compression might be best
    if (mimeType.includes('zip') || 
        mimeType.includes('gzip') ||
        mimeType.includes('compressed')) {
      return CompressionAlgorithm.NONE;
    }

    // Default to gzip for general use
    return CompressionAlgorithm.GZIP;
  }

  validateCompressionOptions(options: CompressionOptions): boolean {
    if (options.level !== undefined) {
      const maxLevel = options.algorithm === CompressionAlgorithm.BROTLI ? 11 : 9;
      if (options.level < 1 || options.level > maxLevel) {
        throw new Error(`Compression level must be between 1 and ${maxLevel} for ${options.algorithm}`);
      }
    }

    if (options.threshold !== undefined && options.threshold < 0) {
      throw new Error('Compression threshold must be non-negative');
    }

    if (options.imageOptimization?.quality !== undefined) {
      if (options.imageOptimization.quality < 1 || options.imageOptimization.quality > 100) {
        throw new Error('Image quality must be between 1 and 100');
      }
    }

    return true;
  }

  async compressBatch(
    files: Array<{ data: Buffer; mimeType: string; key: string }>,
    options?: Partial<CompressionOptions>
  ): Promise<Array<{ key: string; result: CompressionResult }>> {
    const results = [];

    for (const file of files) {
      const result = await this.compressData(file.data, file.mimeType, options);
      results.push({ key: file.key, result });
    }

    return results;
  }
}
