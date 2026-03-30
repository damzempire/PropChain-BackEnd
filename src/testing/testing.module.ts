import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { TestingService } from '../services/TestingService';
import { TestGenerator } from './TestGenerator';
import { ContractTester } from './ContractTester';
import { PerformanceBenchmark } from './PerformanceBenchmark';
import { TestingController } from './testing.controller';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    TestingService,
    TestGenerator,
    ContractTester,
    PerformanceBenchmark,
  ],
  controllers: [TestingController],
  exports: [
    TestingService,
    TestGenerator,
    ContractTester,
    PerformanceBenchmark,
  ],
})
export class TestingModule {}
