import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CloudProvider } from './MultiCloudManager';

export enum StorageTier {
  HOT = 'hot',        // Frequently accessed, low latency
  WARM = 'warm',      // Moderately accessed, balanced cost/performance
  COLD = 'cold',      // Infrequently accessed, cost-optimized
  ARCHIVE = 'archive', // Rarely accessed, lowest cost
}

export interface AccessPattern {
  key: string;
  accessCount: number;
  lastAccessed: Date;
  firstAccessed: Date;
  averageAccessInterval: number;
  size: number;
  contentType: string;
  currentTier: StorageTier;
  provider: CloudProvider;
}

export interface TierMigrationRule {
  fromTier: StorageTier;
  toTier: StorageTier;
  condition: (pattern: AccessPattern) => boolean;
  priority: number;
  description: string;
}

export interface CostAnalysis {
  provider: CloudProvider;
  tier: StorageTier;
  storageCostPerGB: number;
  requestCostPer1000: number;
  dataTransferCostPerGB: number;
  totalMonthlyCost: number;
  savingsPotential: number;
}

export interface OptimizationRecommendation {
  key: string;
  currentProvider: CloudProvider;
  currentTier: StorageTier;
  recommendedProvider: CloudProvider;
  recommendedTier: StorageTier;
  reason: string;
  estimatedSavings: number;
  migrationPriority: 'high' | 'medium' | 'low';
}

@Injectable()
export class StorageOptimizer {
  private readonly logger = new Logger(StorageOptimizer.name);
  private readonly accessPatterns = new Map<string, AccessPattern>();
  private readonly migrationRules: TierMigrationRule[] = [];
  private readonly costMatrix = new Map<string, CostAnalysis>();
  private readonly optimizationHistory: OptimizationRecommendation[] = [];

  constructor(private readonly configService: ConfigService) {
    this.initializeMigrationRules();
    this.initializeCostMatrix();
  }

  private initializeMigrationRules(): void {
    this.migrationRules = [
      // Hot to Warm: Move files that haven't been accessed recently
      {
        fromTier: StorageTier.HOT,
        toTier: StorageTier.WARM,
        condition: (pattern: AccessPattern) => {
          const daysSinceLastAccess = (Date.now() - pattern.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceLastAccess > 7 && pattern.accessCount < 10;
        },
        priority: 1,
        description: 'Move to warm storage after 7 days of inactivity with low access count',
      },

      // Warm to Cold: Move files that are rarely accessed
      {
        fromTier: StorageTier.WARM,
        toTier: StorageTier.COLD,
        condition: (pattern: AccessPattern) => {
          const daysSinceLastAccess = (Date.now() - pattern.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceLastAccess > 30 && pattern.averageAccessInterval > 7;
        },
        priority: 2,
        description: 'Move to cold storage after 30 days of inactivity',
      },

      // Cold to Archive: Move very old or large files
      {
        fromTier: StorageTier.COLD,
        toTier: StorageTier.ARCHIVE,
        condition: (pattern: AccessPattern) => {
          const daysSinceLastAccess = (Date.now() - pattern.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceLastAccess > 90 || (pattern.size > 1024 * 1024 * 1024 && daysSinceLastAccess > 60);
        },
        priority: 3,
        description: 'Move to archive after 90 days of inactivity or for large files',
      },

      // Warm to Hot: Promote frequently accessed files
      {
        fromTier: StorageTier.WARM,
        toTier: StorageTier.HOT,
        condition: (pattern: AccessPattern) => {
          const recentAccesses = this.getRecentAccessCount(pattern, 7); // Last 7 days
          return recentAccesses > 5;
        },
        priority: 1,
        description: 'Promote to hot storage for frequently accessed files',
      },

      // Cold to Warm: Promote files with increasing access patterns
      {
        fromTier: StorageTier.COLD,
        toTier: StorageTier.WARM,
        condition: (pattern: AccessPattern) => {
          const recentAccesses = this.getRecentAccessCount(pattern, 30); // Last 30 days
          return recentAccesses > 3;
        },
        priority: 2,
        description: 'Promote to warm storage for files with increasing access',
      },
    ];
  }

  private initializeCostMatrix(): void {
    // AWS S3 pricing (example rates - should be updated with actual pricing)
    this.costMatrix.set('aws_s3_hot', {
      provider: CloudProvider.AWS_S3,
      tier: StorageTier.HOT,
      storageCostPerGB: 0.023,
      requestCostPer1000: 0.0004,
      dataTransferCostPerGB: 0.09,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('aws_s3_warm', {
      provider: CloudProvider.AWS_S3,
      tier: StorageTier.WARM,
      storageCostPerGB: 0.0125,
      requestCostPer1000: 0.001,
      dataTransferCostPerGB: 0.09,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('aws_s3_cold', {
      provider: CloudProvider.AWS_S3,
      tier: StorageTier.COLD,
      storageCostPerGB: 0.004,
      requestCostPer1000: 0.002,
      dataTransferCostPerGB: 0.09,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('aws_s3_archive', {
      provider: CloudProvider.AWS_S3,
      tier: StorageTier.ARCHIVE,
      storageCostPerGB: 0.00099,
      requestCostPer1000: 0.01,
      dataTransferCostPerGB: 0.09,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    // Google Cloud Storage pricing
    this.costMatrix.set('google_cloud_hot', {
      provider: CloudProvider.GOOGLE_CLOUD,
      tier: StorageTier.HOT,
      storageCostPerGB: 0.02,
      requestCostPer1000: 0.0004,
      dataTransferCostPerGB: 0.12,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('google_cloud_warm', {
      provider: CloudProvider.GOOGLE_CLOUD,
      tier: StorageTier.WARM,
      storageCostPerGB: 0.01,
      requestCostPer1000: 0.001,
      dataTransferCostPerGB: 0.12,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('google_cloud_cold', {
      provider: CloudProvider.GOOGLE_CLOUD,
      tier: StorageTier.COLD,
      storageCostPerGB: 0.004,
      requestCostPer1000: 0.002,
      dataTransferCostPerGB: 0.12,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('google_cloud_archive', {
      provider: CloudProvider.GOOGLE_CLOUD,
      tier: StorageTier.ARCHIVE,
      storageCostPerGB: 0.001,
      requestCostPer1000: 0.01,
      dataTransferCostPerGB: 0.12,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    // Azure Blob Storage pricing
    this.costMatrix.set('azure_blob_hot', {
      provider: CloudProvider.AZURE_BLOB,
      tier: StorageTier.HOT,
      storageCostPerGB: 0.018,
      requestCostPer1000: 0.0004,
      dataTransferCostPerGB: 0.087,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('azure_blob_warm', {
      provider: CloudProvider.AZURE_BLOB,
      tier: StorageTier.WARM,
      storageCostPerGB: 0.01,
      requestCostPer1000: 0.001,
      dataTransferCostPerGB: 0.087,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('azure_blob_cold', {
      provider: CloudProvider.AZURE_BLOB,
      tier: StorageTier.COLD,
      storageCostPerGB: 0.004,
      requestCostPer1000: 0.002,
      dataTransferCostPerGB: 0.087,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });

    this.costMatrix.set('azure_blob_archive', {
      provider: CloudProvider.AZURE_BLOB,
      tier: StorageTier.ARCHIVE,
      storageCostPerGB: 0.001,
      requestCostPer1000: 0.01,
      dataTransferCostPerGB: 0.087,
      totalMonthlyCost: 0,
      savingsPotential: 0,
    });
  }

  recordAccess(key: string, provider: CloudProvider, size: number, contentType: string): void {
    const now = new Date();
    let pattern = this.accessPatterns.get(key);

    if (!pattern) {
      pattern = {
        key,
        accessCount: 0,
        lastAccessed: now,
        firstAccessed: now,
        averageAccessInterval: 0,
        size,
        contentType,
        currentTier: this.determineInitialTier(size, contentType),
        provider,
      };
    } else {
      const interval = now.getTime() - pattern.lastAccessed.getTime();
      pattern.averageAccessInterval = (pattern.averageAccessInterval * pattern.accessCount + interval) / (pattern.accessCount + 1);
      pattern.lastAccessed = now;
    }

    pattern.accessCount++;
    this.accessPatterns.set(key, pattern);
  }

  private determineInitialTier(size: number, contentType: string): StorageTier {
    // Small, frequently accessed file types go to hot
    if (size < 1024 * 1024 && this.isHotContentType(contentType)) {
      return StorageTier.HOT;
    }

    // Large files or archives start in cold
    if (size > 1024 * 1024 * 100 || this.isArchiveContentType(contentType)) {
      return StorageTier.COLD;
    }

    // Default to warm
    return StorageTier.WARM;
  }

  private isHotContentType(contentType: string): boolean {
    const hotTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/json',
      'text/html',
      'text/css',
      'application/javascript',
    ];
    return hotTypes.includes(contentType);
  }

  private isArchiveContentType(contentType: string): boolean {
    const archiveTypes = [
      'application/zip',
      'application/x-tar',
      'application/gzip',
      'application/x-7z-compressed',
    ];
    return archiveTypes.includes(contentType);
  }

  private getRecentAccessCount(pattern: AccessPattern, days: number): number {
    // This is a simplified calculation - in practice, you'd store individual access timestamps
    const daysSinceLastAccess = (Date.now() - pattern.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastAccess > days) return 0;

    // Estimate recent accesses based on average interval
    return Math.max(1, Math.floor(days / Math.max(1, pattern.averageAccessInterval / (1000 * 60 * 60 * 24))));
  }

  @Cron(CronExpression.EVERY_HOUR)
  async analyzeAndOptimize(): Promise<OptimizationRecommendation[]> {
    this.logger.log('Starting storage optimization analysis...');
    
    const recommendations: OptimizationRecommendation[] = [];
    
    for (const [key, pattern] of this.accessPatterns) {
      const tierRecommendation = this.analyzeTierMigration(pattern);
      const providerRecommendation = this.analyzeProviderMigration(pattern);
      
      if (tierRecommendation) {
        recommendations.push(tierRecommendation);
      }
      
      if (providerRecommendation) {
        recommendations.push(providerRecommendation);
      }
    }

    // Sort by priority and estimated savings
    recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.migrationPriority] - priorityOrder[a.migrationPriority];
      if (priorityDiff !== 0) return priorityDiff;
      
      return b.estimatedSavings - a.estimatedSavings;
    });

    this.optimizationHistory.push(...recommendations);
    this.logger.log(`Generated ${recommendations.length} optimization recommendations`);
    
    return recommendations;
  }

  private analyzeTierMigration(pattern: AccessPattern): OptimizationRecommendation | null {
    const applicableRules = this.migrationRules
      .filter(rule => rule.fromTier === pattern.currentTier && rule.condition(pattern))
      .sort((a, b) => a.priority - b.priority);

    if (applicableRules.length === 0) return null;

    const rule = applicableRules[0];
    const currentCost = this.calculateMonthlyCost(pattern.provider, pattern.currentTier, pattern);
    const newCost = this.calculateMonthlyCost(pattern.provider, rule.toTier, pattern);
    const estimatedSavings = currentCost - newCost;

    return {
      key: pattern.key,
      currentProvider: pattern.provider,
      currentTier: pattern.currentTier,
      recommendedProvider: pattern.provider,
      recommendedTier: rule.toTier,
      reason: rule.description,
      estimatedSavings,
      migrationPriority: this.determineMigrationPriority(estimatedSavings, pattern.accessCount),
    };
  }

  private analyzeProviderMigration(pattern: AccessPattern): OptimizationRecommendation | null {
    const currentCost = this.calculateMonthlyCost(pattern.provider, pattern.currentTier, pattern);
    let bestProvider = pattern.provider;
    let bestCost = currentCost;

    // Check all providers for better pricing
    for (const provider of Object.values(CloudProvider)) {
      if (provider === pattern.provider) continue;
      
      const providerCost = this.calculateMonthlyCost(provider, pattern.currentTier, pattern);
      if (providerCost < bestCost) {
        bestCost = providerCost;
        bestProvider = provider;
      }
    }

    if (bestProvider === pattern.provider) return null;

    const estimatedSavings = currentCost - bestCost;

    return {
      key: pattern.key,
      currentProvider: pattern.provider,
      currentTier: pattern.currentTier,
      recommendedProvider: bestProvider,
      recommendedTier: pattern.currentTier,
      reason: `Cost optimization: ${bestProvider} offers better pricing for ${pattern.currentTier} storage`,
      estimatedSavings,
      migrationPriority: this.determineMigrationPriority(estimatedSavings, pattern.accessCount),
    };
  }

  private calculateMonthlyCost(provider: CloudProvider, tier: StorageTier, pattern: AccessPattern): number {
    const costKey = `${provider}_${tier}`;
    const costInfo = this.costMatrix.get(costKey);
    
    if (!costInfo) return 0;

    const sizeGB = pattern.size / (1024 * 1024 * 1024);
    const storageCost = sizeGB * costInfo.storageCostPerGB;
    
    // Estimate monthly requests based on access pattern
    const daysSinceFirstAccess = (Date.now() - pattern.firstAccessed.getTime()) / (1000 * 60 * 60 * 24);
    const daysInMonth = 30;
    const estimatedMonthlyRequests = pattern.accessCount > 0 
      ? (pattern.accessCount / Math.max(1, daysSinceFirstAccess)) * daysInMonth
      : 1;
    
    const requestCost = (estimatedMonthlyRequests / 1000) * costInfo.requestCostPer1000;
    
    // Estimate data transfer (simplified - assumes 10% of data is transferred monthly)
    const dataTransferCost = (sizeGB * 0.1) * costInfo.dataTransferCostPerGB;

    return storageCost + requestCost + dataTransferCost;
  }

  private determineMigrationPriority(savings: number, accessCount: number): 'high' | 'medium' | 'low' {
    if (savings > 10 || (savings > 5 && accessCount < 10)) return 'high';
    if (savings > 2 || (savings > 1 && accessCount < 5)) return 'medium';
    return 'low';
  }

  getAccessPattern(key: string): AccessPattern | undefined {
    return this.accessPatterns.get(key);
  }

  getAllAccessPatterns(): AccessPattern[] {
    return Array.from(this.accessPatterns.values());
  }

  getOptimizationHistory(limit?: number): OptimizationRecommendation[] {
    return limit 
      ? this.optimizationHistory.slice(-limit)
      : [...this.optimizationHistory];
  }

  getCostAnalysis(): CostAnalysis[] {
    return Array.from(this.costMatrix.values());
  }

  async generateCostReport(): Promise<{
    totalMonthlyCost: number;
    costByProvider: Record<CloudProvider, number>;
    costByTier: Record<StorageTier, number>;
    potentialSavings: number;
    recommendations: OptimizationRecommendation[];
  }> {
    const recommendations = await this.analyzeAndOptimize();
    
    let totalCost = 0;
    const costByProvider: Record<CloudProvider, number> = {} as any;
    const costByTier: Record<StorageTier, number> = {} as any;

    // Initialize cost objects
    for (const provider of Object.values(CloudProvider)) {
      costByProvider[provider] = 0;
    }
    for (const tier of Object.values(StorageTier)) {
      costByTier[tier] = 0;
    }

    // Calculate costs for all files
    for (const pattern of this.accessPatterns.values()) {
      const cost = this.calculateMonthlyCost(pattern.provider, pattern.currentTier, pattern);
      totalCost += cost;
      costByProvider[pattern.provider] += cost;
      costByTier[pattern.currentTier] += cost;
    }

    const potentialSavings = recommendations.reduce((sum, rec) => sum + rec.estimatedSavings, 0);

    return {
      totalMonthlyCost: totalCost,
      costByProvider,
      costByTier,
      potentialSavings,
      recommendations: recommendations.slice(0, 10), // Top 10 recommendations
    };
  }

  clearOptimizationHistory(): void {
    this.optimizationHistory.length = 0;
  }

  removeAccessPattern(key: string): boolean {
    return this.accessPatterns.delete(key);
  }

  updateAccessPattern(key: string, updates: Partial<AccessPattern>): boolean {
    const pattern = this.accessPatterns.get(key);
    if (!pattern) return false;

    Object.assign(pattern, updates);
    this.accessPatterns.set(key, pattern);
    return true;
  }
}
