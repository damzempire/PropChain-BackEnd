/**
 * Type Validation Utilities
 *
 * This module provides comprehensive type validation utilities to replace 'any' types
 * with proper TypeScript types and runtime validation.
 *
 * @module utils
 * @since 1.0.0
 */

import { ValidationErrorResult, ValidationSuccessResult, ValidationResult } from '../types/validation.types';

// Base types for common data structures
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// User-related types
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  timezone?: string;
  notifications?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
  };
  privacy?: {
    profileVisibility?: 'public' | 'private' | 'friends';
    showEmail?: boolean;
    showPhone?: boolean;
  };
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'private' | 'friends';
  showEmail: boolean;
  showPhone: boolean;
  allowMessages: boolean;
  allowFriendRequests: boolean;
  dataSharing: boolean;
  marketingConsent: boolean;
}

// Property-related types
export interface PropertyFeatures {
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  parkingSpaces?: number;
  hasGarage?: boolean;
  hasPool?: boolean;
  hasGarden?: boolean;
  furnished?: boolean;
  petFriendly?: boolean;
  airConditioning?: boolean;
  heating?: string;
  amenities?: string[];
}

export interface PropertyLocation {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  neighborhood?: string;
  district?: string;
}

// Transaction-related types
export interface TransactionMetadata {
  source?: string;
  medium?: string;
  campaign?: string;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
  referrer?: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

// Cache-related types
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  expiresAt?: Date;
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
  metadata?: Record<string, unknown>;
}

export interface CacheInvalidationRecord {
  key: string;
  reason: string;
  timestamp: Date;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// Security-related types
export interface SecurityContext {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  user?: {
    id: string;
    role: string;
    permissions: string[];
  };
  session?: {
    id: string;
    createdAt: Date;
    expiresAt: Date;
  };
}

// Type guard utilities
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

export function isArray<T>(value: unknown, guard?: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && (guard ? value.every(guard) : true);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasProperty<K extends string | number | symbol>(
  obj: unknown,
  prop: K
): obj is Record<K, unknown> {
  return isObject(obj) && prop in obj;
}

// Runtime validation utilities
export function createValidationError(message: string, code: string, path?: string): ValidationErrorResult {
  return {
    isValid: false,
    errors: [{
      path: path || 'root',
      message,
      code,
      value: undefined
    }],
    value: undefined
  };
}

export function createValidationSuccess<T>(value: T): ValidationSuccessResult<T> {
  return {
    isValid: true,
    value
  };
}

// Specific type validators
export function validateUserPreferences(value: unknown): ValidationResult<UserPreferences> {
  if (!isObject(value)) {
    return createValidationError('User preferences must be an object', 'INVALID_TYPE');
  }

  const preferences: UserPreferences = {};
  
  if (hasProperty(value, 'theme')) {
    if (!isString(value.theme) || !['light', 'dark', 'auto'].includes(value.theme)) {
      return createValidationError('Invalid theme value', 'INVALID_THEME', 'theme');
    }
    preferences.theme = value.theme;
  }

  if (hasProperty(value, 'language')) {
    if (!isString(value.language)) {
      return createValidationError('Language must be a string', 'INVALID_TYPE', 'language');
    }
    preferences.language = value.language;
  }

  if (hasProperty(value, 'timezone')) {
    if (!isString(value.timezone)) {
      return createValidationError('Timezone must be a string', 'INVALID_TYPE', 'timezone');
    }
    preferences.timezone = value.timezone;
  }

  // Add more validation as needed...
  
  return createValidationSuccess(preferences);
}

export function validatePrivacySettings(value: unknown): ValidationResult<PrivacySettings> {
  if (!isObject(value)) {
    return createValidationError('Privacy settings must be an object', 'INVALID_TYPE');
  }

  const settings = value as PrivacySettings;
  
  if (!isString(settings.profileVisibility) || 
      !['public', 'private', 'friends'].includes(settings.profileVisibility)) {
    return createValidationError('Invalid profile visibility', 'INVALID_VISIBILITY', 'profileVisibility');
  }

  if (!isBoolean(settings.showEmail)) {
    return createValidationError('showEmail must be boolean', 'INVALID_TYPE', 'showEmail');
  }

  if (!isBoolean(settings.showPhone)) {
    return createValidationError('showPhone must be boolean', 'INVALID_TYPE', 'showPhone');
  }

  if (!isBoolean(settings.allowMessages)) {
    return createValidationError('allowMessages must be boolean', 'INVALID_TYPE', 'allowMessages');
  }

  if (!isBoolean(settings.allowFriendRequests)) {
    return createValidationError('allowFriendRequests must be boolean', 'INVALID_TYPE', 'allowFriendRequests');
  }

  if (!isBoolean(settings.dataSharing)) {
    return createValidationError('dataSharing must be boolean', 'INVALID_TYPE', 'dataSharing');
  }

  if (!isBoolean(settings.marketingConsent)) {
    return createValidationError('marketingConsent must be boolean', 'INVALID_TYPE', 'marketingConsent');
  }

  return createValidationSuccess(settings);
}

export function validatePaginationOptions(value: unknown): ValidationResult<PaginationOptions> {
  if (!isObject(value)) {
    return createValidationError('Pagination options must be an object', 'INVALID_TYPE');
  }

  const options = value as PaginationOptions;
  
  if (!isNumber(options.page) || options.page < 1) {
    return createValidationError('Page must be a positive number', 'INVALID_PAGE', 'page');
  }

  if (!isNumber(options.limit) || options.limit < 1 || options.limit > 100) {
    return createValidationError('Limit must be between 1 and 100', 'INVALID_LIMIT', 'limit');
  }

  if (options.sortOrder && !['asc', 'desc'].includes(options.sortOrder)) {
    return createValidationError('Sort order must be asc or desc', 'INVALID_SORT_ORDER', 'sortOrder');
  }

  return createValidationSuccess(options);
}

// Utility functions for common operations
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  options: PaginationOptions
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / options.limit);
  
  return {
    data,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages,
      hasNext: options.page < totalPages,
      hasPrev: options.page > 1
    }
  };
}

export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: { code: string; message: string; details?: Record<string, unknown> }
): ApiResponse<T> {
  const response: ApiResponse<T> = {
    success,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
      version: '1.0.0'
    }
  };

  if (data) {
    response.data = data;
  }

  if (error) {
    response.error = error;
  }

  return response;
}

function generateRequestId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Type assertion utilities with runtime validation
export function assertIsString(value: unknown, message = 'Value must be a string'): asserts value is string {
  if (!isString(value)) {
    throw new TypeError(message);
  }
}

export function assertIsNumber(value: unknown, message = 'Value must be a number'): asserts value is number {
  if (!isNumber(value)) {
    throw new TypeError(message);
  }
}

export function assertIsBoolean(value: unknown, message = 'Value must be a boolean'): asserts value is boolean {
  if (!isBoolean(value)) {
    throw new TypeError(message);
  }
}

export function assertIsArray<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  message = 'Value must be an array'
): asserts value is T[] {
  if (!isArray(value, guard)) {
    throw new TypeError(message);
  }
}

export function assertIsObject(value: unknown, message = 'Value must be an object'): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new TypeError(message);
  }
}
