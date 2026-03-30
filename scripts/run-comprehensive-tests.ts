#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TestingService } from '../src/services/TestingService';
import { ConfigService } from '@nestjs/config';

async function runComprehensiveTests() {
  console.log('🚀 Starting comprehensive API testing...');
  
  let app;
  try {
    // Create NestJS application
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log', 'debug']
    });

    const testingService = app.get(TestingService);
    const configService = app.get(ConfigService);

    console.log('📋 Available test suites:');
    const suites = testingService.getTestSuites();
    suites.forEach(suite => {
      console.log(`  - ${suite.name}: ${suite.description || 'No description'}`);
    });

    if (suites.length === 0) {
      console.log('⚠️  No test suites found. Creating default suite...');
      
      const defaultSuite = {
        name: 'default-api-tests',
        description: 'Default comprehensive API testing suite',
        testGeneration: {
          includeNegativeTests: true,
          includeEdgeCases: true,
          mockDataStrategy: 'realistic'
        },
        contractTesting: {
          enabled: true,
          verificationOptions: {
            timeout: 30000,
            retries: 3
          }
        },
        performanceTesting: {
          enabled: true,
          endpoints: [
            {
              name: 'health-check',
              method: 'GET',
              url: configService.get('API_BASE_URL', 'http://localhost:3000') + '/api/v1/health',
              weight: 10
            }
          ],
          thresholds: {
            maxResponseTime: 1000,
            minRequestsPerSecond: 100,
            maxErrorRate: 1
          },
          config: {
            duration: 60,
            concurrency: 10
          }
        }
      };

      await testingService.createTestSuite(defaultSuite);
      console.log('✅ Default test suite created');
    }

    // Run health check first
    console.log('🏥 Running health check...');
    const healthStatus = await testingService.runHealthCheck();
    console.log(`Health Status: ${healthStatus.status}`);
    if (healthStatus.status !== 'healthy') {
      console.log('⚠️  Health check failed. Tests may not run properly.');
      healthStatus.checks.forEach(check => {
        if (!check.passed) {
          console.log(`  ❌ ${check.name}: ${check.error || 'Failed'}`);
        }
      });
    }

    // Execute test suites
    const suiteName = process.argv[2] || suites[0]?.name || 'default-api-tests';
    console.log(`🧪 Executing test suite: ${suiteName}`);

    const startTime = Date.now();
    const result = await testingService.executeTestSuite(suiteName);
    const duration = Date.now() - startTime;

    console.log('\n📊 Test Execution Results:');
    console.log(`  Suite: ${result.suiteName}`);
    console.log(`  Duration: ${result.duration}ms`);
    console.log(`  Total Tests: ${result.summary.totalTests}`);
    console.log(`  Passed: ${result.summary.passedTests}`);
    console.log(`  Failed: ${result.summary.failedTests}`);
    console.log(`  Success Rate: ${result.summary.successRate.toFixed(2)}%`);

    if (result.generatedTests && result.generatedTests.length > 0) {
      console.log(`  Generated Tests: ${result.generatedTests.length}`);
    }

    if (result.contractTests && result.contractTests.length > 0) {
      const contractSummary = result.contractTests.reduce((acc, suite) => ({
        total: acc.total + suite.summary.total,
        passed: acc.passed + suite.summary.passed,
        failed: acc.failed + suite.summary.failed
      }), { total: 0, passed: 0, failed: 0 });
      
      console.log(`  Contract Tests: ${contractSummary.total} (${contractSummary.passed} passed, ${contractSummary.failed} failed)`);
    }

    if (result.performanceReport) {
      const perf = result.performanceReport.summary;
      console.log(`  Performance Tests:`);
      console.log(`    Overall RPS: ${perf.overallRps.toFixed(2)}`);
      console.log(`    Avg Response Time: ${perf.averageResponseTime.toFixed(2)}ms`);
      console.log(`    Error Rate: ${perf.errorRate.toFixed(2)}%`);
      console.log(`    Success Rate: ${perf.successRate.toFixed(2)}%`);
    }

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
    }

    // Generate comprehensive report
    console.log('\n📄 Generating comprehensive report...');
    const report = await testingService.generateComprehensiveReport();
    
    const reportPath = `test-reports/comprehensive-report-${Date.now()}.md`;
    require('fs').writeFileSync(reportPath, report);
    console.log(`📋 Report saved to: ${reportPath}`);

    // Exit with appropriate code
    if (result.summary.failedTests > 0) {
      console.log('\n❌ Some tests failed');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed successfully!');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Error running comprehensive tests:', error);
    process.exit(1);
  } finally {
    if (app) {
      await app.close();
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the comprehensive tests
runComprehensiveTests();
