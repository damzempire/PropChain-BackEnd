import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SecurityHeaderConfig {
  name: string;
  value: string;
  description: string;
  enabled: boolean;
  priority: number;
}

export interface SecurityHeaderPolicy {
  strictTransportSecurity: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  contentSecurityPolicy: {
    enabled: boolean;
    policy: string;
  };
  xFrameOptions: {
    enabled: boolean;
    value: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    allowFrom?: string;
  };
  xContentTypeOptions: {
    enabled: boolean;
    nosniff: boolean;
  };
  referrerPolicy: {
    enabled: boolean;
    policy: string;
  };
  xXssProtection: {
    enabled: boolean;
    enabledValue: boolean;
    modeBlock: boolean;
  };
  permissionsPolicy: {
    enabled: boolean;
    features: Record<string, boolean>;
  };
  customHeaders: Array<{
    name: string;
    value: string;
    description?: string;
  }>;
}

@Injectable()
export class SecurityHeaders {
  private readonly logger = new Logger(SecurityHeaders.name);
  private defaultPolicy: SecurityHeaderPolicy;

  constructor(private readonly configService: ConfigService) {
    this.defaultPolicy = this.getDefaultPolicy();
  }

  /**
   * Get default security header policy
   */
  private getDefaultPolicy(): SecurityHeaderPolicy {
    return {
      strictTransportSecurity: {
        enabled: this.configService.get<boolean>('SECURITY_HSTS_ENABLED', true),
        maxAge: this.configService.get<number>('SECURITY_HSTS_MAX_AGE', 31536000), // 1 year
        includeSubDomains: this.configService.get<boolean>('SECURITY_HSTS_INCLUDE_SUBDOMAINS', true),
        preload: this.configService.get<boolean>('SECURITY_HSTS_PRELOAD', false),
      },
      contentSecurityPolicy: {
        enabled: this.configService.get<boolean>('SECURITY_CSP_ENABLED', true),
        policy: this.configService.get<string>(
          'SECURITY_CSP_POLICY',
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
        ),
      },
      xFrameOptions: {
        enabled: this.configService.get<boolean>('SECURITY_X_FRAME_OPTIONS_ENABLED', true),
        value: (this.configService.get<string>('SECURITY_X_FRAME_OPTIONS', 'DENY') as 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM'),
        allowFrom: this.configService.get<string>('SECURITY_X_FRAME_OPTIONS_ALLOW_FROM'),
      },
      xContentTypeOptions: {
        enabled: this.configService.get<boolean>('SECURITY_X_CONTENT_TYPE_OPTIONS_ENABLED', true),
        nosniff: true,
      },
      referrerPolicy: {
        enabled: this.configService.get<boolean>('SECURITY_REFERRER_POLICY_ENABLED', true),
        policy: this.configService.get<string>('SECURITY_REFERRER_POLICY', 'strict-origin-when-cross-origin'),
      },
      xXssProtection: {
        enabled: this.configService.get<boolean>('SECURITY_X_XSS_PROTECTION_ENABLED', true),
        enabledValue: true,
        modeBlock: true,
      },
      permissionsPolicy: {
        enabled: this.configService.get<boolean>('SECURITY_PERMISSIONS_POLICY_ENABLED', true),
        features: {
          accelerometer: false,
          ambientLightSensor: false,
          autoplay: false,
          camera: false,
          encryptedMedia: true,
          fullscreen: true,
          geolocation: false,
          gyroscope: false,
          magnetometer: false,
          microphone: false,
          midi: false,
          payment: false,
          pictureInPicture: true,
          speaker: false,
          usb: false,
          vr: false,
        },
      },
      customHeaders: [],
    };
  }

  /**
   * Get all security headers based on policy
   */
  getSecurityHeaders(policy?: Partial<SecurityHeaderPolicy>): SecurityHeaderConfig[] {
    const finalPolicy = { ...this.defaultPolicy, ...policy };
    const headers: SecurityHeaderConfig[] = [];

    // Strict-Transport-Security (HSTS)
    if (finalPolicy.strictTransportSecurity.enabled) {
      const hsts = this.buildHSTSHeader(finalPolicy.strictTransportSecurity);
      headers.push(hsts);
    }

    // Content-Security-Policy
    if (finalPolicy.contentSecurityPolicy.enabled) {
      headers.push({
        name: 'Content-Security-Policy',
        value: finalPolicy.contentSecurityPolicy.policy,
        description: 'Prevents various types of attacks including Cross Site Scripting (XSS)',
        enabled: true,
        priority: 1,
      });
    }

    // X-Frame-Options
    if (finalPolicy.xFrameOptions.enabled) {
      const frameOptions = this.buildXFrameOptionsHeader(finalPolicy.xFrameOptions);
      headers.push(frameOptions);
    }

    // X-Content-Type-Options
    if (finalPolicy.xContentTypeOptions.enabled && finalPolicy.xContentTypeOptions.nosniff) {
      headers.push({
        name: 'X-Content-Type-Options',
        value: 'nosniff',
        description: 'Prevents MIME-type sniffing',
        enabled: true,
        priority: 1,
      });
    }

    // Referrer-Policy
    if (finalPolicy.referrerPolicy.enabled) {
      headers.push({
        name: 'Referrer-Policy',
        value: finalPolicy.referrerPolicy.policy,
        description: 'Controls how much referrer information is sent with requests',
        enabled: true,
        priority: 1,
      });
    }

    // X-XSS-Protection
    if (finalPolicy.xXssProtection.enabled) {
      const xssProtection = this.buildXXSSProtectionHeader(finalPolicy.xXssProtection);
      headers.push(xssProtection);
    }

    // Permissions-Policy
    if (finalPolicy.permissionsPolicy.enabled) {
      const permissionsPolicy = this.buildPermissionsPolicyHeader(finalPolicy.permissionsPolicy);
      headers.push(permissionsPolicy);
    }

    // Custom headers
    for (const customHeader of finalPolicy.customHeaders) {
      headers.push({
        name: customHeader.name,
        value: customHeader.value,
        description: customHeader.description || 'Custom security header',
        enabled: true,
        priority: 0,
      });
    }

    // Sort by priority (higher priority first)
    return headers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Build HSTS header
   */
  private buildHSTSHeader(config: SecurityHeaderPolicy['strictTransportSecurity']): SecurityHeaderConfig {
    let value = `max-age=${config.maxAge}`;
    
    if (config.includeSubDomains) {
      value += '; includeSubDomains';
    }
    
    if (config.preload) {
      value += '; preload';
    }

    return {
      name: 'Strict-Transport-Security',
      value,
      description: 'Enforces HTTPS connections and protects against protocol downgrade attacks',
      enabled: true,
      priority: 10,
    };
  }

  /**
   * Build X-Frame-Options header
   */
  private buildXFrameOptionsHeader(config: SecurityHeaderPolicy['xFrameOptions']): SecurityHeaderConfig {
    let value = config.value;
    
    if (config.value === 'ALLOW-FROM' && config.allowFrom) {
      value += ` ${config.allowFrom}`;
    }

    return {
      name: 'X-Frame-Options',
      value,
      description: 'Protects against clickjacking attacks',
      enabled: true,
      priority: 5,
    };
  }

  /**
   * Build X-XSS-Protection header
   */
  private buildXXSSProtectionHeader(config: SecurityHeaderPolicy['xXssProtection']): SecurityHeaderConfig {
    let value = '';
    
    if (config.enabledValue) {
      value = '1';
      if (config.modeBlock) {
        value += '; mode=block';
      }
    } else {
      value = '0';
    }

    return {
      name: 'X-XSS-Protection',
      value,
      description: 'Enables XSS filtering in older browsers',
      enabled: true,
      priority: 3,
    };
  }

  /**
   * Build Permissions-Policy header
   */
  private buildPermissionsPolicyHeader(config: SecurityHeaderPolicy['permissionsPolicy']): SecurityHeaderConfig {
    const features: string[] = [];
    
    for (const [feature, enabled] of Object.entries(config.features)) {
      features.push(`${feature}=${enabled ? '*' : '()'}`);
    }

    return {
      name: 'Permissions-Policy',
      value: features.join(', '),
      description: 'Controls browser features and APIs access',
      enabled: true,
      priority: 2,
    };
  }

  /**
   * Get security headers as plain object for Express
   */
  getSecurityHeadersObject(policy?: Partial<SecurityHeaderPolicy>): Record<string, string> {
    const headers = this.getSecurityHeaders(policy);
    const headersObject: Record<string, string> = {};
    
    for (const header of headers) {
      if (header.enabled) {
        headersObject[header.name] = header.value;
      }
    }
    
    return headersObject;
  }

  /**
   * Validate security header configuration
   */
  validatePolicy(policy: Partial<SecurityHeaderPolicy>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate HSTS configuration
    if (policy.strictTransportSecurity) {
      if (policy.strictTransportSecurity.maxAge && policy.strictTransportSecurity.maxAge < 0) {
        errors.push('HSTS maxAge must be a positive number');
      }
    }

    // Validate X-Frame-Options configuration
    if (policy.xFrameOptions) {
      if (policy.xFrameOptions.value === 'ALLOW-FROM' && !policy.xFrameOptions.allowFrom) {
        errors.push('X-Frame-Options ALLOW-FROM requires allowFrom URL');
      }
    }

    // Validate CSP configuration
    if (policy.contentSecurityPolicy) {
      if (policy.contentSecurityPolicy.policy && policy.contentSecurityPolicy.policy.length > 4096) {
        errors.push('Content Security Policy is too long (max 4096 characters)');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get recommended policy for production
   */
  getProductionPolicy(): SecurityHeaderPolicy {
    return {
      strictTransportSecurity: {
        enabled: true,
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      contentSecurityPolicy: {
        enabled: true,
        policy: "default-src 'self'; script-src 'self' 'nonce-{{nonce}}'; style-src 'self' 'nonce-{{nonce}}'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';",
      },
      xFrameOptions: {
        enabled: true,
        value: 'DENY',
      },
      xContentTypeOptions: {
        enabled: true,
        nosniff: true,
      },
      referrerPolicy: {
        enabled: true,
        policy: 'strict-origin-when-cross-origin',
      },
      xXssProtection: {
        enabled: true,
        enabledValue: true,
        modeBlock: true,
      },
      permissionsPolicy: {
        enabled: true,
        features: {
          accelerometer: false,
          ambientLightSensor: false,
          autoplay: false,
          camera: false,
          encryptedMedia: true,
          fullscreen: true,
          geolocation: false,
          gyroscope: false,
          magnetometer: false,
          microphone: false,
          midi: false,
          payment: false,
          pictureInPicture: true,
          speaker: false,
          usb: false,
          vr: false,
        },
      },
      customHeaders: [
        {
          name: 'X-Permitted-Cross-Domain-Policies',
          value: 'none',
          description: 'Restricts cross-domain policy files',
        },
        {
          name: 'Cross-Origin-Embedder-Policy',
          value: 'require-corp',
          description: 'Prevents cross-origin embedding without explicit permission',
        },
        {
          name: 'Cross-Origin-Resource-Policy',
          value: 'same-origin',
          description: 'Restricts cross-origin resource access',
        },
      ],
    };
  }

  /**
   * Get development policy (less strict)
   */
  getDevelopmentPolicy(): SecurityHeaderPolicy {
    return {
      strictTransportSecurity: {
        enabled: false, // Disabled for development
        maxAge: 86400, // 1 day
        includeSubDomains: false,
        preload: false,
      },
      contentSecurityPolicy: {
        enabled: true,
        policy: "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss: https:;",
      },
      xFrameOptions: {
        enabled: true,
        value: 'SAMEORIGIN',
      },
      xContentTypeOptions: {
        enabled: true,
        nosniff: true,
      },
      referrerPolicy: {
        enabled: true,
        policy: 'no-referrer-when-downgrade',
      },
      xXssProtection: {
        enabled: true,
        enabledValue: true,
        modeBlock: true,
      },
      permissionsPolicy: {
        enabled: true,
        features: {
          accelerometer: false,
          ambientLightSensor: false,
          autoplay: true, // Allow for development
          camera: false,
          encryptedMedia: true,
          fullscreen: true,
          geolocation: true, // Allow for development
          gyroscope: false,
          magnetometer: false,
          microphone: false,
          midi: false,
          payment: false,
          pictureInPicture: true,
          speaker: true, // Allow for development
          usb: false,
          vr: false,
        },
      },
      customHeaders: [],
    };
  }

  /**
   * Update default policy
   */
  updateDefaultPolicy(updates: Partial<SecurityHeaderPolicy>): void {
    this.defaultPolicy = { ...this.defaultPolicy, ...updates };
    this.logger.log('Security headers policy updated');
  }

  /**
   * Get current policy
   */
  getCurrentPolicy(): SecurityHeaderPolicy {
    return { ...this.defaultPolicy };
  }

  /**
   * Generate nonce for CSP
   */
  generateNonce(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Replace nonce placeholder in CSP
   */
  replaceNonceInPolicy(policy: string, nonce: string): string {
    return policy.replace(/\{\{nonce\}\}/g, nonce);
  }
}
