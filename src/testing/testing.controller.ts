import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Delete, 
  Query,
  HttpStatus,
  Res,
  UseGuards
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TestingService, TestingSuiteConfig, TestExecutionResult } from '../services/TestingService';
import { TestGenerator, GeneratedTest, TestGenerationOptions } from './TestGenerator';
import { ContractTester, ContractDefinition, ContractTestSuite } from './ContractTester';
import { PerformanceBenchmark, BenchmarkEndpoint, LoadTestConfig, BenchmarkReport } from './PerformanceBenchmark';

@ApiTags('testing')
@Controller('api/v1/testing')
export class TestingController {
  constructor(private readonly testingService: TestingService) {}

  @Post('suites')
  @ApiOperation({ summary: 'Create a new test suite' })
  @ApiResponse({ status: 201, description: 'Test suite created successfully' })
  async createTestSuite(@Body() config: TestingSuiteConfig) {
    await this.testingService.createTestSuite(config);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Test suite created successfully',
      data: { name: config.name }
    };
  }

  @Get('suites')
  @ApiOperation({ summary: 'Get all test suites' })
  @ApiResponse({ status: 200, description: 'List of all test suites' })
  async getTestSuites() {
    const suites = this.testingService.getTestSuites();
    return {
      statusCode: HttpStatus.OK,
      data: suites
    };
  }

  @Get('suites/:name')
  @ApiOperation({ summary: 'Get a specific test suite' })
  @ApiParam({ name: 'name', description: 'Test suite name' })
  @ApiResponse({ status: 200, description: 'Test suite details' })
  async getTestSuite(@Param('name') name: string) {
    const suite = this.testingService.getTestSuite(name);
    if (!suite) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Test suite not found'
      };
    }
    return {
      statusCode: HttpStatus.OK,
      data: suite
    };
  }

  @Post('suites/:name')
  @ApiOperation({ summary: 'Update a test suite' })
  @ApiParam({ name: 'name', description: 'Test suite name' })
  @ApiResponse({ status: 200, description: 'Test suite updated successfully' })
  async updateTestSuite(
    @Param('name') name: string,
    @Body() config: Partial<TestingSuiteConfig>
  ) {
    await this.testingService.updateTestSuite(name, config);
    return {
      statusCode: HttpStatus.OK,
      message: 'Test suite updated successfully'
    };
  }

  @Delete('suites/:name')
  @ApiOperation({ summary: 'Delete a test suite' })
  @ApiParam({ name: 'name', description: 'Test suite name' })
  @ApiResponse({ status: 200, description: 'Test suite deleted successfully' })
  async deleteTestSuite(@Param('name') name: string) {
    await this.testingService.deleteTestSuite(name);
    return {
      statusCode: HttpStatus.OK,
      message: 'Test suite deleted successfully'
    };
  }

  @Post('suites/:name/execute')
  @ApiOperation({ summary: 'Execute a test suite' })
  @ApiParam({ name: 'name', description: 'Test suite name' })
  @ApiResponse({ status: 200, description: 'Test suite execution completed' })
  async executeTestSuite(@Param('name') name: string): Promise<{
    statusCode: number;
    data: TestExecutionResult;
  }> {
    try {
      const result = await this.testingService.executeTestSuite(name);
      return {
        statusCode: HttpStatus.OK,
        data: result
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        data: null
      };
    }
  }

  @Get('executions')
  @ApiOperation({ summary: 'Get execution history' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit number of results' })
  @ApiResponse({ status: 200, description: 'Execution history' })
  async getExecutionHistory(@Query('limit') limit?: string) {
    const history = this.testingService.getExecutionHistory(limit ? parseInt(limit) : undefined);
    return {
      statusCode: HttpStatus.OK,
      data: history
    };
  }

  @Get('executions/:id')
  @ApiOperation({ summary: 'Get execution report by ID' })
  @ApiParam({ name: 'id', description: 'Execution ID' })
  @ApiResponse({ status: 200, description: 'Execution report' })
  async getExecutionReport(@Param('id') id: string) {
    const report = this.testingService.getExecutionReport(id);
    if (!report) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Execution report not found'
      };
    }
    return {
      statusCode: HttpStatus.OK,
      data: report
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Run health check tests' })
  @ApiResponse({ status: 200, description: 'Health check results' })
  async runHealthCheck() {
    const healthStatus = await this.testingService.runHealthCheck();
    return {
      statusCode: HttpStatus.OK,
      data: healthStatus
    };
  }

  @Get('report/comprehensive')
  @ApiOperation({ summary: 'Generate comprehensive testing report' })
  @ApiResponse({ status: 200, description: 'Comprehensive report' })
  async generateComprehensiveReport(@Res() res: Response) {
    const report = await this.testingService.generateComprehensiveReport();
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="testing-report-${Date.now()}.md"`);
    res.send(report);
  }

  // Test Generation Endpoints
  @Post('generate/tests')
  @ApiOperation({ summary: 'Generate automated tests from OpenAPI spec' })
  @ApiResponse({ status: 200, description: 'Generated tests' })
  async generateTests(@Body() options: TestGenerationOptions) {
    // This would need to be implemented to expose the TestGenerator functionality
    return {
      statusCode: HttpStatus.OK,
      message: 'Test generation endpoint - implementation needed'
    };
  }

  // Contract Testing Endpoints
  @Post('contracts/verify')
  @ApiOperation({ summary: 'Verify contract against provider' })
  @ApiResponse({ status: 200, description: 'Contract verification results' })
  async verifyContract(@Body() data: {
    contractName: string;
    providerBaseUrl: string;
    options?: any;
  }) {
    // This would need to be implemented to expose the ContractTester functionality
    return {
      statusCode: HttpStatus.OK,
      message: 'Contract verification endpoint - implementation needed'
    };
  }

  @Post('contracts/generate')
  @ApiOperation({ summary: 'Generate contract from OpenAPI spec' })
  @ApiResponse({ status: 200, description: 'Generated contract' })
  async generateContract(@Body() data: {
    consumerName: string;
    providerName: string;
    providerBaseUrl: string;
  }) {
    // This would need to be implemented to expose the ContractTester functionality
    return {
      statusCode: HttpStatus.OK,
      message: 'Contract generation endpoint - implementation needed'
    };
  }

  // Performance Testing Endpoints
  @Post('benchmark/endpoint')
  @ApiOperation({ summary: 'Benchmark a single endpoint' })
  @ApiResponse({ status: 200, description: 'Benchmark results' })
  async benchmarkEndpoint(@Body() data: {
    endpoint: BenchmarkEndpoint;
    config?: any;
  }) {
    // This would need to be implemented to expose the PerformanceBenchmark functionality
    return {
      statusCode: HttpStatus.OK,
      message: 'Endpoint benchmark endpoint - implementation needed'
    };
  }

  @Post('benchmark/load-test')
  @ApiOperation({ summary: 'Run load test' })
  @ApiResponse({ status: 200, description: 'Load test results' })
  async runLoadTest(@Body() config: LoadTestConfig) {
    // This would need to be implemented to expose the PerformanceBenchmark functionality
    return {
      statusCode: HttpStatus.OK,
      message: 'Load test endpoint - implementation needed'
    };
  }

  @Post('benchmark/stress-test')
  @ApiOperation({ summary: 'Run stress test' })
  @ApiResponse({ status: 200, description: 'Stress test results' })
  async runStressTest(@Body() data: {
    endpoint: BenchmarkEndpoint;
    maxConcurrency?: number;
    stepSize?: number;
    stepDuration?: number;
  }) {
    // This would need to be implemented to expose the PerformanceBenchmark functionality
    return {
      statusCode: HttpStatus.OK,
      message: 'Stress test endpoint - implementation needed'
    };
  }

  @Post('benchmark/spike-test')
  @ApiOperation({ summary: 'Run spike test' })
  @ApiResponse({ status: 200, description: 'Spike test results' })
  async runSpikeTest(@Body() data: {
    endpoint: BenchmarkEndpoint;
    normalConcurrency?: number;
    spikeConcurrency?: number;
    normalDuration?: number;
    spikeDuration?: number;
  }) {
    // This would need to be implemented to expose the PerformanceBenchmark functionality
    return {
      statusCode: HttpStatus.OK,
      message: 'Spike test endpoint - implementation needed'
    };
  }
}
