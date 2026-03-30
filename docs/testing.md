# Advanced API Testing and Quality Assurance

This document describes the comprehensive API testing and quality assurance system implemented for the PropChain backend.

## Overview

The testing system provides:
- **Automated API test generation** from OpenAPI specifications
- **Contract testing framework** for provider-consumer contract verification
- **Performance benchmarking** with load testing, stress testing, and spike testing
- **Test data management** with realistic mock data generation
- **Scheduled test execution** with comprehensive reporting

## Architecture

### Core Components

1. **TestGenerator** (`src/testing/TestGenerator.ts`)
   - Generates automated tests from OpenAPI/Swagger specifications
   - Supports multiple mock data strategies (random, realistic, minimal)
   - Creates unit, integration, and performance tests
   - Generates contract tests based on API schemas

2. **ContractTester** (`src/testing/ContractTester.ts`)
   - Implements contract testing framework similar to Pact
   - Supports contract generation from OpenAPI specs
   - Validates provider-consumer contracts
   - Provides contract verification and publishing

3. **PerformanceBenchmark** (`src/testing/PerformanceBenchmark.ts`)
   - Comprehensive performance testing capabilities
   - Load testing, stress testing, spike testing, endurance testing
   - Real-time metrics and percentile calculations
   - Performance threshold validation

4. **TestingService** (`src/services/TestingService.ts`)
   - Main orchestration service
   - Manages test suites and execution
   - Provides scheduled testing capabilities
   - Generates comprehensive reports

## Usage

### Creating a Test Suite

```typescript
const testSuite: TestingSuiteConfig = {
  name: 'api-comprehensive-tests',
  description: 'Comprehensive API testing suite',
  testGeneration: {
    includeNegativeTests: true,
    includeEdgeCases: true,
    includePerformanceTests: true,
    mockDataStrategy: 'realistic'
  },
  contractTesting: {
    enabled: true,
    contractsPath: 'contracts',
    verificationOptions: {
      timeout: 30000,
      retries: 3,
      allowExtraResponseFields: false
    }
  },
  performanceTesting: {
    enabled: true,
    endpoints: [
      {
        name: 'get-properties',
        method: 'GET',
        url: 'http://localhost:3000/api/v1/properties',
        weight: 3
      },
      {
        name: 'create-property',
        method: 'POST',
        url: 'http://localhost:3000/api/v1/properties',
        weight: 1
      }
    ],
    thresholds: {
      maxResponseTime: 1000,
      minRequestsPerSecond: 100,
      maxErrorRate: 1
    },
    config: {
      duration: 300,
      concurrency: 20,
      rampUpTime: 30
    }
  },
  schedule: {
    enabled: true,
    cronExpression: '0 2 * * *' // Daily at 2 AM
  }
};
```

### Executing Tests

```typescript
// Execute a test suite
const result = await testingService.executeTestSuite('api-comprehensive-tests');

// Run health check
const health = await testingService.runHealthCheck();

// Generate comprehensive report
const report = await testingService.generateComprehensiveReport();
```

## API Endpoints

### Test Suite Management
- `POST /api/v1/testing/suites` - Create test suite
- `GET /api/v1/testing/suites` - List all test suites
- `GET /api/v1/testing/suites/:name` - Get specific test suite
- `PUT /api/v1/testing/suites/:name` - Update test suite
- `DELETE /api/v1/testing/suites/:name` - Delete test suite

### Test Execution
- `POST /api/v1/testing/suites/:name/execute` - Execute test suite
- `GET /api/v1/testing/executions` - Get execution history
- `GET /api/v1/testing/executions/:id` - Get execution report

### Health and Reporting
- `GET /api/v1/testing/health` - Run health check
- `GET /api/v1/testing/report/comprehensive` - Generate comprehensive report

## Configuration

### Environment Variables

```bash
# API Configuration
API_BASE_URL=http://localhost:3000

# Contract Testing
CONTRACT_REGISTRY_URL=http://localhost:8080

# Performance Testing
DEFAULT_TIMEOUT=30000
DEFAULT_CONCURRENCY=10
DEFAULT_DURATION=60
```

## Test Types

### 1. Automated Test Generation

The system can generate tests automatically from your OpenAPI specification:

- **Unit Tests**: Test individual endpoints with various inputs
- **Integration Tests**: Test endpoint interactions and workflows
- **Negative Tests**: Test error conditions and edge cases
- **Performance Tests**: Basic performance benchmarks

### 2. Contract Testing

Contract testing ensures that your API contracts are maintained between providers and consumers:

- **Contract Generation**: Auto-generate contracts from OpenAPI specs
- **Contract Verification**: Verify provider compliance with contracts
- **Contract Publishing**: Publish contracts to a registry
- **Schema Validation**: Validate request/response schemas

### 3. Performance Testing

Comprehensive performance testing capabilities:

- **Load Testing**: Test under normal and peak load conditions
- **Stress Testing**: Test system limits and breaking points
- **Spike Testing**: Test response to sudden load increases
- **Endurance Testing**: Test performance over extended periods
- **Threshold Validation**: Validate against performance SLAs

## Reports and Analytics

### Test Reports

The system generates detailed reports including:

- **Execution Summary**: Pass/fail rates, duration, test counts
- **Performance Metrics**: Response times, throughput, percentiles
- **Error Analysis**: Error rates, error types, failure patterns
- **Trend Analysis**: Performance trends over time
- **Recommendations**: Automated recommendations based on results

### Report Formats

- **JSON**: Machine-readable reports for CI/CD integration
- **Markdown**: Human-readable reports for documentation
- **HTML**: Interactive reports with charts and graphs
- **JUnit**: XML reports for test result aggregation

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: API Testing
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run comprehensive tests
        run: npm run test:comprehensive
      - name: Upload test reports
        uses: actions/upload-artifact@v2
        with:
          name: test-reports
          path: test-reports/
```

### Package.json Scripts

```json
{
  "scripts": {
    "test:comprehensive": "ts-node scripts/run-comprehensive-tests.ts",
    "test:contracts": "npm run test:contracts",
    "test:performance": "npm run test:performance",
    "test:load": "npm run test:load",
    "test:stress": "npm run test:stress"
  }
}
```

## Best Practices

### 1. Test Suite Organization
- Create separate suites for different testing needs
- Use descriptive names and descriptions
- Configure appropriate scheduling for each suite

### 2. Performance Testing
- Start with low concurrency and gradually increase
- Set realistic thresholds based on SLAs
- Monitor system resources during tests

### 3. Contract Testing
- Generate contracts from your OpenAPI specification
- Verify contracts in CI/CD pipeline
- Keep contracts in version control

### 4. Test Data Management
- Use realistic mock data for better test coverage
- Separate test data from production data
- Clean up test data after execution

## Troubleshooting

### Common Issues

1. **Test Generation Fails**
   - Check OpenAPI specification validity
   - Verify API server is running
   - Check network connectivity

2. **Contract Verification Fails**
   - Verify provider URL is accessible
   - Check contract format and content
   - Review verification options

3. **Performance Test Issues**
   - Monitor system resources
   - Check timeout configurations
   - Verify endpoint availability

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
```

## Future Enhancements

Planned improvements include:

- **Visual Test Reports**: Interactive dashboards and charts
- **AI-Powered Test Generation**: ML-based test case generation
- **Distributed Testing**: Support for multi-region testing
- **Real-time Monitoring**: Live performance monitoring
- **Integration Monitoring**: External service dependency testing

## Support

For questions or issues:
- Check the logs in the `test-reports` directory
- Review the generated reports for detailed error information
- Consult the API documentation for endpoint details
