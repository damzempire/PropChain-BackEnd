import { Injectable, Logger } from '@nestjs/common';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VersionStatus = 'active' | 'deprecated' | 'sunset';

export interface ApiVersion {
  version: string;
  status: VersionStatus;
  releasedAt: string;
  deprecatedAt?: string;
  sunsetAt?: string;
  breakingChanges: string[];
  migrationGuideUrl?: string;
  usageCount: number;
}

export interface DeprecationNotice {
  version: string;
  sunsetAt: string;
  message: string;
  migrationGuideUrl?: string;
}

export interface MigrationPlan {
  fromVersion: string;
  toVersion: string;
  steps: string[];
  breakingChanges: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
}

export interface VersionUsageStats {
  version: string;
  requestCount: number;
  lastUsedAt: string;
  uniqueClients: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * VersionManagerService
 *
 * Comprehensive API versioning with deprecation workflows, migration
 * assistance, backward compatibility checks, and version usage analytics.
 */
@Injectable()
export class VersionManagerService {
  private readonly logger = new Logger(VersionManagerService.name);

  private readonly versions = new Map<string, ApiVersion>();
  private readonly usageStats = new Map<string, VersionUsageStats>();

  constructor() {
    this.seedDefaultVersions();
  }

  // ── Version Registry ─────────────────────────────────────────────────────

  /**
   * Register a new API version.
   */
  registerVersion(version: ApiVersion): void {
    this.versions.set(version.version, version);
    this.logger.log(`Registered API version: ${version.version} (${version.status})`);
  }

  /**
   * Get metadata for a specific version.
   */
  getVersion(version: string): ApiVersion | undefined {
    return this.versions.get(version);
  }

  /**
   * List all registered versions sorted newest first.
   */
  listVersions(): ApiVersion[] {
    return Array.from(this.versions.values()).sort(
      (a, b) => b.version.localeCompare(a.version),
    );
  }

  /**
   * Return the latest active API version.
   */
  getLatestActiveVersion(): string {
    const active = this.listVersions().filter((v) => v.status === 'active');
    return active.length > 0 ? active[0].version : 'v1';
  }

  // ── Deprecation ──────────────────────────────────────────────────────────

  /**
   * Mark a version as deprecated and schedule its sunset.
   */
  deprecateVersion(
    version: string,
    sunsetAt: string,
    migrationGuideUrl?: string,
  ): DeprecationNotice | null {
    const v = this.versions.get(version);
    if (!v) {
      this.logger.warn(`Cannot deprecate unknown version: ${version}`);
      return null;
    }

    v.status = 'deprecated';
    v.deprecatedAt = new Date().toISOString();
    v.sunsetAt = sunsetAt;
    if (migrationGuideUrl) v.migrationGuideUrl = migrationGuideUrl;

    this.versions.set(version, v);

    const notice: DeprecationNotice = {
      version,
      sunsetAt,
      message: `API ${version} is deprecated and will be removed on ${sunsetAt}. Please migrate to ${this.getLatestActiveVersion()}.`,
      migrationGuideUrl,
    };

    this.logger.warn(`Deprecated ${version} — sunset: ${sunsetAt}`);
    return notice;
  }

  /**
   * Mark a deprecated version as sunset (fully removed).
   */
  sunsetVersion(version: string): void {
    const v = this.versions.get(version);
    if (v) {
      v.status = 'sunset';
      this.versions.set(version, v);
      this.logger.log(`Version ${version} has been sunset`);
    }
  }

  /**
   * Build deprecation headers for a response when the client uses a deprecated version.
   */
  buildDeprecationHeaders(version: string): Record<string, string> {
    const v = this.versions.get(version);
    if (!v || v.status === 'active') return {};

    const headers: Record<string, string> = {
      Deprecation: v.deprecatedAt ?? 'true',
      'Sunset': v.sunsetAt ?? '',
      Link: v.migrationGuideUrl
        ? `<${v.migrationGuideUrl}>; rel="successor-version"`
        : '',
    };

    return headers;
  }

  // ── Compatibility ────────────────────────────────────────────────────────

  /**
   * Check whether a requested version is still supported.
   */
  isSupported(version: string): boolean {
    const v = this.versions.get(version);
    return v !== undefined && v.status !== 'sunset';
  }

  /**
   * Check for breaking changes when moving between versions.
   */
  checkBackwardCompatibility(
    fromVersion: string,
    toVersion: string,
  ): { compatible: boolean; breakingChanges: string[] } {
    const target = this.versions.get(toVersion);
    if (!target) return { compatible: false, breakingChanges: [`Version ${toVersion} not found`] };

    const breaking = target.breakingChanges;
    return {
      compatible: breaking.length === 0,
      breakingChanges: breaking,
    };
  }

  // ── Migration Assistance ─────────────────────────────────────────────────

  /**
   * Generate a migration plan from one version to another.
   */
  getMigrationPlan(fromVersion: string, toVersion: string): MigrationPlan {
    const target = this.versions.get(toVersion);
    const breaking = target?.breakingChanges ?? [];

    const effort: MigrationPlan['estimatedEffort'] =
      breaking.length === 0 ? 'low' : breaking.length <= 3 ? 'medium' : 'high';

    const steps: string[] = [
      `Review breaking changes between ${fromVersion} and ${toVersion}`,
      'Update request/response models to match the new schema',
      'Replace deprecated endpoint paths with their successors',
      'Run integration tests against the new version',
      `Update client version header to ${toVersion}`,
    ];

    if (target?.migrationGuideUrl) {
      steps.unshift(`Read the migration guide: ${target.migrationGuideUrl}`);
    }

    return { fromVersion, toVersion, steps, breakingChanges: breaking, estimatedEffort: effort };
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  /**
   * Record a request against a version for usage analytics.
   */
  recordRequest(version: string, clientId: string): void {
    const existing = this.usageStats.get(version) ?? {
      version,
      requestCount: 0,
      lastUsedAt: '',
      uniqueClients: 0,
    };

    existing.requestCount += 1;
    existing.lastUsedAt = new Date().toISOString();
    // Simple unique-client approximation (production would use a Set persisted in Redis)
    existing.uniqueClients = Math.max(existing.uniqueClients, clientId ? existing.uniqueClients + 1 : 0);

    this.usageStats.set(version, existing);
  }

  /**
   * Return usage analytics for all versions.
   */
  getUsageAnalytics(): VersionUsageStats[] {
    return Array.from(this.usageStats.values()).sort(
      (a, b) => b.requestCount - a.requestCount,
    );
  }

  // ── Seed ────────────────────────────────────────────────────────────────

  private seedDefaultVersions(): void {
    const defaults: ApiVersion[] = [
      {
        version: 'v1',
        status: 'deprecated',
        releasedAt: '2023-01-01T00:00:00Z',
        deprecatedAt: '2024-01-01T00:00:00Z',
        sunsetAt: '2025-01-01T00:00:00Z',
        breakingChanges: [],
        usageCount: 0,
      },
      {
        version: 'v2',
        status: 'active',
        releasedAt: '2024-01-01T00:00:00Z',
        breakingChanges: ['Renamed /properties/list to /properties', 'Auth header changed to Bearer'],
        usageCount: 0,
      },
    ];

    defaults.forEach((v) => this.versions.set(v.version, v));
  }
}
