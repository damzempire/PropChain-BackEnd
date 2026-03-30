import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

export interface BenchmarkConfig {
  duration?: number; // in seconds
  concurrency?: number;
  rampUpTime?: number; // in seconds
  warmupRequests?: number;
  timeout?: number; // in milliseconds
  thinkTime?: number; // in milliseconds between requests
}

export interface BenchmarkEndpoint {
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, any>;
  weight?: number; // for weighted distribution
}

export interface BenchmarkResult {
  endpoint: string;
  method: string;
  url: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  duration: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  errorRate: number;
  errors: Array<{
    message: string;
    count: number;
    percentage: number;
  }>;
  throughput: {
    bytesTransferred: number;
    bytesPerSecond: number;
  };
}

export interface LoadTestConfig extends BenchmarkConfig {
  endpoints: BenchmarkEndpoint[];
  scenario?: string;
  distribution?: 'uniform' | 'weighted' | 'sequential';
}

export interface BenchmarkReport {
  timestamp: string;
  config: LoadTestConfig;
  results: BenchmarkResult[];
  summary: {
    totalRequests: number;
    totalDuration: number;
    overallRps: number;
    averageResponseTime: number;
    errorRate: number;
    successRate: number;
  };
  systemMetrics?: {
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  };
}

export interface BenchmarkThresholds {
  maxResponseTime?: number;
  minRequestsPerSecond?: number;
  maxErrorRate?: number;
  maxMemoryUsage?: number;
  maxCpuUsage?: number;
}

@Injectable()
export class PerformanceBenchmark extends EventEmitter {
  private readonly logger = new Logger(PerformanceBenchmark.name);
  private readonly reportsDir = 'test-reports/performance';
  private isRunning = false;
  private activeWorkers: Array<{ id: number; status: string }> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: AxiosInstance
  ) {
    super();
  }

  /**
   * Run performance benchmark for a single endpoint
   */
  async benchmarkEndpoint(
    endpoint: BenchmarkEndpoint,
    config: BenchmarkConfig = {}
  ): Promise<BenchmarkResult> {
    const finalConfig = this.mergeWithDefaults(config);
    this.logger.log(`Starting benchmark for ${endpoint.method} ${endpoint.url}`);

    const results = {
      responseTimes: [] as number[],
      errors: new Map<string, number>(),
      bytesTransferred: 0,
      successfulRequests: 0,
      failedRequests: 0
    };

    // Warmup phase
    if (finalConfig.warmupRequests > 0) {
      await this.warmup(endpoint, finalConfig.warmupRequests);
    }

    const startTime = performance.now();
    const endTime = startTime + (finalConfig.duration * 1000);
    let requestCount = 0;

    // Main benchmark loop
    while (performance.now() < endTime && !this.isRunning) {
      try {
        const requestStart = performance.now();
        const response = await this.executeRequest(endpoint, finalConfig.timeout);
        const requestEnd = performance.now();

        const responseTime = requestEnd - requestStart;
        results.responseTimes.push(responseTime);
        results.bytesTransferred += this.calculateBytesTransferred(response);
        results.successfulRequests++;

        requestCount++;

        // Think time between requests
        if (finalConfig.thinkTime > 0) {
          await this.sleep(finalConfig.thinkTime);
        }

        // Emit progress
        if (requestCount % 100 === 0) {
          this.emit('progress', {
            endpoint: endpoint.name,
            requests: requestCount,
            responseTime: responseTime,
            rps: requestCount / ((performance.now() - startTime) / 1000)
          });
        }

      } catch (error) {
        results.failedRequests++;
        const errorMessage = error.message || 'Unknown error';
        results.errors.set(errorMessage, (results.errors.get(errorMessage) || 0) + 1);
      }
    }

    const totalDuration = performance.now() - startTime;
    return this.calculateBenchmarkResult(endpoint, results, totalDuration);
  }

  /**
   * Run load test with multiple endpoints
   */
  async runLoadTest(config: LoadTestConfig): Promise<BenchmarkReport> {
    this.logger.log(`Starting load test with ${config.endpoints.length} endpoints`);
    this.isRunning = true;

    const startTime = performance.now();
    const results: BenchmarkResult[] = [];
    const systemMetrics = await this.captureSystemMetrics();

    // Initialize workers for concurrent execution
    const workers = this.initializeWorkers(config.concurrency || 1);
    
    try {
      if (config.distribution === 'sequential') {
        // Run endpoints sequentially
        for (const endpoint of config.endpoints) {
          const result = await this.benchmarkEndpoint(endpoint, config);
          results.push(result);
        }
      } else {
        // Run endpoints concurrently
        const promises = config.endpoints.map(endpoint => 
          this.benchmarkEndpoint(endpoint, config)
        );
        const concurrentResults = await Promise.all(promises);
        results.push(...concurrentResults);
      }

    } finally {
      this.isRunning = false;
      this.cleanupWorkers(workers);
    }

    const totalDuration = performance.now() - startTime;
    const report = this.generateBenchmarkReport(config, results, totalDuration, systemMetrics);

    await this.saveBenchmarkReport(report);
    this.emit('complete', report);

    return report;
  }

  /**
   * Run stress test with increasing load
   */
  async runStressTest(
    baseEndpoint: BenchmarkEndpoint,
    maxConcurrency: number = 50,
    stepSize: number = 5,
    stepDuration: number = 30
  ): Promise<BenchmarkResult[]> {
    this.logger.log(`Starting stress test up to ${maxConcurrency} concurrent users`);
    
    const results: BenchmarkResult[] = [];
    let currentConcurrency = stepSize;

    while (currentConcurrency <= maxConcurrency && this.isRunning) {
      this.logger.log(`Testing with ${currentConcurrency} concurrent users`);
      
      const config: BenchmarkConfig = {
        duration: stepDuration,
        concurrency: currentConcurrency,
        warmupRequests: 10
      };

      const result = await this.benchmarkEndpoint(baseEndpoint, config);
      results.push(result);

      // Check if we should stop (high error rate or response time)
      if (result.errorRate > 10 || result.p95 > 10000) {
        this.logger.warn(`Stress threshold reached at ${currentConcurrency} concurrent users`);
        break;
      }

      currentConcurrency += stepSize;
    }

    return results;
  }

  /**
   * Run spike test (sudden load increase)
   */
  async runSpikeTest(
    endpoint: BenchmarkEndpoint,
    normalConcurrency: number = 10,
    spikeConcurrency: number = 100,
    normalDuration: number = 60,
    spikeDuration: number = 30
  ): Promise<BenchmarkResult[]> {
    this.logger.log(`Starting spike test: ${normalConcurrency} -> ${spikeConcurrency} users`);

    const results: BenchmarkResult[] = [];

    // Normal load phase
    this.logger.log('Normal load phase');
    const normalConfig: BenchmarkConfig = {
      duration: normalDuration,
      concurrency: normalConcurrency,
      warmupRequests: 20
    };
    const normalResult = await this.benchmarkEndpoint(endpoint, normalConfig);
    results.push(normalResult);

    // Spike phase
    this.logger.log('Spike phase');
    const spikeConfig: BenchmarkConfig = {
      duration: spikeDuration,
      concurrency: spikeConcurrency,
      warmupRequests: 5
    };
    const spikeResult = await this.benchmarkEndpoint(endpoint, spikeConfig);
    results.push(spikeResult);

    // Recovery phase
    this.logger.log('Recovery phase');
    const recoveryConfig: BenchmarkConfig = {
      duration: normalDuration,
      concurrency: normalConcurrency,
      warmupRequests: 10
    };
    const recoveryResult = await this.benchmarkEndpoint(endpoint, recoveryConfig);
    results.push(recoveryResult);

    return results;
  }

  /**
   * Run endurance test (long-running test)
   */
  async runEnduranceTest(
    endpoint: BenchmarkEndpoint,
    duration: number = 3600, // 1 hour
    concurrency: number = 20
  ): Promise<BenchmarkResult> {
    this.logger.log(`Starting endurance test for ${duration} seconds`);

    const config: BenchmarkConfig = {
      duration,
      concurrency,
      warmupRequests: 50,
      timeout: 30000
    };

    return this.benchmarkEndpoint(endpoint, config);
  }

  /**
   * Compare performance between two endpoints or configurations
   */
  async comparePerformance(
    endpoints: BenchmarkEndpoint[],
    config: BenchmarkConfig = {}
  ): Promise<{ results: BenchmarkResult[]; comparison: any }> {
    this.logger.log(`Comparing performance for ${endpoints.length} endpoints`);

    const results: BenchmarkResult[] = [];
    
    for (const endpoint of endpoints) {
      const result = await this.benchmarkEndpoint(endpoint, config);
      results.push(result);
    }

    const comparison = this.generateComparison(results);

    return { results, comparison };
  }

  /**
   * Validate performance against thresholds
   */
  async validatePerformance(
    endpoint: BenchmarkEndpoint,
    thresholds: BenchmarkThresholds,
    config: BenchmarkConfig = {}
  ): Promise<{ result: BenchmarkResult; passed: boolean; violations: string[] }> {
    const result = await this.benchmarkEndpoint(endpoint, config);
    const violations: string[] = [];

    if (thresholds.maxResponseTime && result.p95 > thresholds.maxResponseTime) {
      violations.push(`P95 response time ${result.p95}ms exceeds threshold ${thresholds.maxResponseTime}ms`);
    }

    if (thresholds.minRequestsPerSecond && result.requestsPerSecond < thresholds.minRequestsPerSecond) {
      violations.push(`RPS ${result.requestsPerSecond} below threshold ${thresholds.minRequestsPerSecond}`);
    }

    if (thresholds.maxErrorRate && result.errorRate > thresholds.maxErrorRate) {
      violations.push(`Error rate ${result.errorRate}% exceeds threshold ${thresholds.maxErrorRate}%`);
    }

    const passed = violations.length === 0;

    return { result, passed, violations };
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(results: BenchmarkResult[]): Promise<string> {
    const report = `
# Performance Benchmark Report

Generated: ${new Date().toISOString()}

## Summary
- Total Requests: ${results.reduce((sum, r) => sum + r.totalRequests, 0)}
- Average RPS: ${results.reduce((sum, r) => sum + r.requestsPerSecond, 0) / results.length}
- Average Response Time: ${results.reduce((sum, r) => sum + r.averageResponseTime, 0) / results.length}ms
- Overall Error Rate: ${results.reduce((sum, r) => sum + r.errorRate, 0) / results.length}%

## Results by Endpoint
${results.map(result => `
### ${result.method} ${result.url}
- Requests: ${result.totalRequests}
- RPS: ${result.requestsPerSecond}
- Avg Response Time: ${result.averageResponseTime}ms
- P95: ${result.p95}ms
- P99: ${result.p99}ms
- Error Rate: ${result.errorRate}%
${result.errors.length > 0 ? `
#### Errors:
${result.errors.map(error => `- ${error.message}: ${error.count} (${error.percentage}%)`).join('\n')}
` : ''}
`).join('\n')}

## Recommendations
${this.generateRecommendations(results)}
`;

    return report;
  }

  private mergeWithDefaults(config: BenchmarkConfig): BenchmarkConfig {
    return {
      duration: 60,
      concurrency: 10,
      rampUpTime: 10,
      warmupRequests: 20,
      timeout: 30000,
      thinkTime: 0,
      ...config
    };
  }

  private async warmup(endpoint: BenchmarkEndpoint, requests: number): Promise<void> {
    this.logger.log(`Warming up with ${requests} requests`);
    
    for (let i = 0; i < requests; i++) {
      try {
        await this.executeRequest(endpoint, 5000);
      } catch (error) {
        // Ignore warmup errors
      }
    }
  }

  private async executeRequest(endpoint: BenchmarkEndpoint, timeout: number): Promise<any> {
    const config = {
      method: endpoint.method.toLowerCase(),
      url: endpoint.url,
      headers: endpoint.headers,
      data: endpoint.body,
      params: endpoint.query,
      timeout,
      validateStatus: () => true // Don't throw on HTTP errors
    };

    return this.httpClient.request(config);
  }

  private calculateBytesTransferred(response: any): number {
    const responseSize = JSON.stringify(response.data).length;
    const headerSize = JSON.stringify(response.headers).length;
    return responseSize + headerSize;
  }

  private calculateBenchmarkResult(
    endpoint: BenchmarkEndpoint,
    results: any,
    duration: number
  ): BenchmarkResult {
    const responseTimes = results.responseTimes.sort((a: number, b: number) => a - b);
    const totalRequests = results.successfulRequests + results.failedRequests;

    const errors = Array.from(results.errors.entries()).map(([message, count]) => ({
      message,
      count,
      percentage: (count / totalRequests) * 100
    }));

    return {
      endpoint: endpoint.name,
      method: endpoint.method,
      url: endpoint.url,
      totalRequests,
      successfulRequests: results.successfulRequests,
      failedRequests: results.failedRequests,
      duration,
      requestsPerSecond: totalRequests / (duration / 1000),
      averageResponseTime: responseTimes.reduce((sum: number, time: number) => sum + time, 0) / responseTimes.length,
      minResponseTime: responseTimes[0] || 0,
      maxResponseTime: responseTimes[responseTimes.length - 1] || 0,
      p50: this.percentile(responseTimes, 50),
      p90: this.percentile(responseTimes, 90),
      p95: this.percentile(responseTimes, 95),
      p99: this.percentile(responseTimes, 99),
      errorRate: (results.failedRequests / totalRequests) * 100,
      errors,
      throughput: {
        bytesTransferred: results.bytesTransferred,
        bytesPerSecond: results.bytesTransferred / (duration / 1000)
      }
    };
  }

  private percentile(sortedArray: number[], p: number): number {
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }

  private initializeWorkers(count: number): Array<{ id: number; status: string }> {
    const workers = [];
    for (let i = 0; i < count; i++) {
      workers.push({ id: i, status: 'ready' });
    }
    this.activeWorkers = workers;
    return workers;
  }

  private cleanupWorkers(workers: Array<{ id: number; status: string }>): void {
    workers.forEach(worker => {
      worker.status = 'stopped';
    });
    this.activeWorkers = [];
  }

  private async captureSystemMetrics(): Promise<any> {
    // In a real implementation, this would capture actual system metrics
    // For now, return mock data
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: Math.random() * 100
    };
  }

  private generateBenchmarkReport(
    config: LoadTestConfig,
    results: BenchmarkResult[],
    duration: number,
    systemMetrics: any
  ): BenchmarkReport {
    const totalRequests = results.reduce((sum, r) => sum + r.totalRequests, 0);
    const totalSuccessful = results.reduce((sum, r) => sum + r.successfulRequests, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failedRequests, 0);

    return {
      timestamp: new Date().toISOString(),
      config,
      results,
      summary: {
        totalRequests,
        totalDuration: duration,
        overallRps: totalRequests / (duration / 1000),
        averageResponseTime: results.reduce((sum, r) => sum + r.averageResponseTime, 0) / results.length,
        errorRate: (totalFailed / totalRequests) * 100,
        successRate: (totalSuccessful / totalRequests) * 100
      },
      systemMetrics
    };
  }

  private generateComparison(results: BenchmarkResult[]): any {
    const fastest = results.reduce((min, r) => r.averageResponseTime < min.averageResponseTime ? r : min);
    const slowest = results.reduce((max, r) => r.averageResponseTime > max.averageResponseTime ? r : max);
    const highestRps = results.reduce((max, r) => r.requestsPerSecond > max.requestsPerSecond ? r : max);

    return {
      fastest: {
        endpoint: fastest.endpoint,
        responseTime: fastest.averageResponseTime
      },
      slowest: {
        endpoint: slowest.endpoint,
        responseTime: slowest.averageResponseTime
      },
      highestThroughput: {
        endpoint: highestRps.endpoint,
        rps: highestRps.requestsPerSecond
      },
      performanceRatio: slowest.averageResponseTime / fastest.averageResponseTime
    };
  }

  private generateRecommendations(results: BenchmarkResult[]): string {
    const recommendations: string[] = [];

    const avgResponseTime = results.reduce((sum, r) => sum + r.averageResponseTime, 0) / results.length;
    const avgErrorRate = results.reduce((sum, r) => sum + r.errorRate, 0) / results.length;

    if (avgResponseTime > 1000) {
      recommendations.push('- Consider optimizing slow endpoints (average response time > 1s)');
    }

    if (avgErrorRate > 5) {
      recommendations.push('- High error rate detected, investigate stability issues');
    }

    const slowEndpoints = results.filter(r => r.p95 > 2000);
    if (slowEndpoints.length > 0) {
      recommendations.push(`- ${slowEndpoints.length} endpoints have P95 > 2s, consider caching or optimization`);
    }

    const highErrorEndpoints = results.filter(r => r.errorRate > 10);
    if (highErrorEndpoints.length > 0) {
      recommendations.push(`- ${highErrorEndpoints.length} endpoints have error rate > 10%, investigate reliability`);
    }

    if (recommendations.length === 0) {
      recommendations.push('- Performance looks good! Consider setting up automated monitoring.');
    }

    return recommendations.join('\n');
  }

  private async saveBenchmarkReport(report: BenchmarkReport): Promise<void> {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const filename = `benchmark-${Date.now()}.json`;
    const filepath = path.join(this.reportsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    this.logger.log(`Benchmark report saved to ${filepath}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop running benchmark
   */
  stopBenchmark(): void {
    this.isRunning = false;
    this.logger.log('Benchmark stopped by user');
  }
}
