import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MultiCloudManager } from './MultiCloudManager';
import { StorageOptimizer } from './StorageOptimizer';
import { DataCompressor } from './DataCompressor';
import { StorageService } from '../services/StorageService';
import { StorageController } from './storage.controller';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    MultiCloudManager,
    StorageOptimizer,
    DataCompressor,
    StorageService,
  ],
  controllers: [StorageController],
  exports: [
    MultiCloudManager,
    StorageOptimizer,
    DataCompressor,
    StorageService,
  ],
})
export class StorageModule {}
