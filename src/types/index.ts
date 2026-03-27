/**
 * Type Definitions Index
 *
 * This module exports all type definitions used throughout the PropChain backend.
 * It provides a centralized location for importing types across the application.
 *
 * @module types
 * @since 1.0.0
 */

/**
 * Export all Prisma-related type definitions
 * Includes model interfaces, query result types, and Prisma utility types
 */
export * from './prisma.types';

/**
 * Export all service-related type definitions
 * Includes response interfaces, pagination types, and service operation types
 * Note: Explicitly not re-exporting ValidationResult to avoid conflict with validation.types
 */
export {
  type ServiceResponse,
  type PaginatedResponse,
  type ApiResponse,
  type CreateServiceOptions,
  type UpdateServiceOptions,
  type DeleteServiceOptions,
  type SearchServiceOptions,
  type ServiceValidationResult,
  type ValidationError,
  type ValidationWarning,
  type CacheOptions,
} from './service.types';

/**
 * Export all validation-related type definitions
 * Includes validation rules, schemas, and constraint definitions
 */
export * from './validation.types';

/**
 * Export all security-related type definitions
 * Includes authentication types, MFA interfaces, and security event types
 */
export * from './security.types';

/**
 * Export all API-related type definitions
 * Includes HTTP request/response types, WebSocket types, and GraphQL types
 */
export * from './api.types';

/**
 * Export all guard utilities
 * Includes type guard functions for runtime type checking
 */
export * from './guards';
