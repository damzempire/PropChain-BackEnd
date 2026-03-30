import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  Query,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { StorageService } from '../services/StorageService';
import { CloudProvider, StorageTier } from './MultiCloudManager';
import { CompressionAlgorithm } from './DataCompressor';

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file to multi-cloud storage' })
  @ApiBody({
    description: 'File upload with optional compression and tier selection',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        key: {
          type: 'string',
          description: 'Unique file key (optional, will generate if not provided)',
        },
        compress: {
          type: 'boolean',
          description: 'Enable compression (default: true)',
        },
        compressionAlgorithm: {
          type: 'string',
          enum: Object.values(CompressionAlgorithm),
          description: 'Compression algorithm to use',
        },
        tier: {
          type: 'string',
          enum: Object.values(StorageTier),
          description: 'Storage tier (default: warm)',
        },
        provider: {
          type: 'string',
          enum: Object.values(CloudProvider),
          description: 'Cloud provider (default: primary provider)',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or parameters' })
  @ApiResponse({ status: 500, description: 'Upload failed' })
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }), // 100MB
          new FileTypeValidator({ fileType: /(.*?)/ }), // Accept all file types
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('key') key?: string,
    @Body('compress') compress?: string,
    @Body('compressionAlgorithm') compressionAlgorithm?: CompressionAlgorithm,
    @Body('tier') tier?: StorageTier,
    @Body('provider') provider?: CloudProvider,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const fileKey = key || this.generateFileKey(file.originalname);
    
    const result = await this.storageService.uploadFile(
      fileKey,
      file.buffer,
      file.mimetype,
      {
        compress: compress !== 'false',
        compressionAlgorithm,
        tier,
        provider,
      }
    );

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return {
      success: true,
      data: result.fileInfo,
      message: 'File uploaded successfully',
    };
  }

  @Get(':key')
  @ApiOperation({ summary: 'Download a file from storage' })
  @ApiResponse({ status: 200, description: 'File downloaded successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 500, description: 'Download failed' })
  async downloadFile(
    @Param('key') key: string,
    @Query('decompress') decompress?: string,
    @Query('algorithm') algorithm?: CompressionAlgorithm,
  ) {
    const result = await this.storageService.downloadFile(key, {
      decompress: decompress === 'true',
      algorithm,
      recordAccess: true,
    });

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return {
      success: true,
      data: {
        key,
        size: result.data.length,
        contentType: result.fileInfo.contentType,
        data: result.data.toString('base64'), // Return as base64 for API response
        fileInfo: result.fileInfo,
      },
      message: 'File downloaded successfully',
    };
  }

  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a file from storage' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 500, description: 'Delete failed' })
  async deleteFile(@Param('key') key: string) {
    const result = await this.storageService.deleteFile(key);

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return {
      success: true,
      message: 'File deleted successfully',
    };
  }

  @Put(':key/move')
  @ApiOperation({ summary: 'Move a file to different provider or tier' })
  @ApiResponse({ status: 200, description: 'File moved successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 500, description: 'Move failed' })
  async moveFile(
    @Param('key') key: string,
    @Body('provider') provider?: CloudProvider,
    @Body('tier') tier?: StorageTier,
  ) {
    const result = await this.storageService.moveFile(key, provider, tier);

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return {
      success: true,
      data: result.fileInfo,
      message: 'File moved successfully',
    };
  }

  @Get(':key/info')
  @ApiOperation({ summary: 'Get file information' })
  @ApiResponse({ status: 200, description: 'File information retrieved' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFileInfo(@Param('key') key: string) {
    const fileInfo = this.storageService.getFileInfo(key);

    if (!fileInfo) {
      throw new BadRequestException('File not found');
    }

    return {
      success: true,
      data: fileInfo,
      message: 'File information retrieved',
    };
  }

  @Get('list')
  @ApiOperation({ summary: 'List files with optional filtering' })
  @ApiResponse({ status: 200, description: 'Files listed successfully' })
  async listFiles(
    @Query('provider') provider?: CloudProvider,
    @Query('tier') tier?: StorageTier,
    @Query('compressed') compressed?: string,
    @Query('contentType') contentType?: string,
  ) {
    const files = this.storageService.listFiles({
      provider,
      tier,
      compressed: compressed === 'true' ? true : compressed === 'false' ? false : undefined,
      contentType,
    });

    return {
      success: true,
      data: files,
      count: files.length,
      message: 'Files listed successfully',
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get storage metrics and analytics' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  async getMetrics() {
    const metrics = await this.storageService.getStorageMetrics();

    return {
      success: true,
      data: metrics,
      message: 'Storage metrics retrieved',
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get storage system health status' })
  @ApiResponse({ status: 200, description: 'Health status retrieved' })
  async getHealth() {
    const health = this.storageService.getStorageHealth();

    return {
      success: true,
      data: health,
      message: 'Storage health status retrieved',
    };
  }

  @Post('optimize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run storage optimization analysis' })
  @ApiResponse({ status: 200, description: 'Optimization completed' })
  async optimizeStorage() {
    const result = await this.storageService.optimizeStorage();

    return {
      success: true,
      data: result,
      message: 'Storage optimization completed',
    };
  }

  @Post(':key/compress-test')
  @ApiOperation({ summary: 'Test compression algorithms on a file' })
  @ApiResponse({ status: 200, description: 'Compression test completed' })
  async testCompression(
    @Param('key') key: string,
    @Body('algorithms') algorithms?: CompressionAlgorithm[],
  ) {
    try {
      const results = await this.storageService.testCompression(key, algorithms);

      return {
        success: true,
        data: results,
        message: 'Compression test completed',
      };
    } catch (error) {
      throw new BadRequestException(`Compression test failed: ${error.message}`);
    }
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean up expired files' })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  async cleanupExpiredFiles(@Body('maxAge') maxAge: number) {
    if (!maxAge || maxAge < 0) {
      throw new BadRequestException('Valid maxAge (in milliseconds) is required');
    }

    const result = await this.storageService.cleanupExpiredFiles(maxAge);

    return {
      success: true,
      data: result,
      message: 'File cleanup completed',
    };
  }

  @Get('report')
  @ApiOperation({ summary: 'Generate comprehensive storage report' })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  async generateReport() {
    const report = this.storageService.generateStorageReport();

    return {
      success: true,
      data: report,
      message: 'Storage report generated',
    };
  }

  private generateFileKey(originalName: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop();
    const baseName = originalName.split('.').slice(0, -1).join('.');
    
    return `${baseName}_${timestamp}_${randomString}.${extension}`;
  }
}
