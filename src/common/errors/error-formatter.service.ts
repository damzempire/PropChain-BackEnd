import { Injectable } from '@nestjs/common';
import { ErrorCode, ErrorResponse, FieldError } from './error.types';

/**
 * Error response formatter service
 * Creates standardized error responses with proper formatting
 */
@Injectable()
export class ErrorFormatterService {
  /**
   * Create a standardized error response
   */
  createErrorResponse(
    statusCode: number,
    errorCode: ErrorCode | string,
    message: string,
    options?: {
      fieldErrors?: FieldError[];
      correlationId?: string;
      path?: string;
      meta?: Record<string, any>;
    },
  ): ErrorResponse {
    const isDevelopment = process.env.NODE_ENV === 'development';

    return {
      statusCode,
      errorCode,
      message,
      ...(options?.fieldErrors && { details: options.fieldErrors }),
      ...(options?.correlationId && { correlationId: options.correlationId }),
      timestamp: new Date().toISOString(),
      path: options?.path || '/api/unknown',
      ...(isDevelopment && options?.meta && {
        meta: options.meta,
      }),
    };
  }

  /**
   * Create validation error response
   */
  createValidationError(
    fieldErrors: FieldError[],
    options?: { correlationId?: string; path?: string },
  ): ErrorResponse {
    return this.createErrorResponse(400, ErrorCode.VALIDATION_FAILED, 'Validation failed', {
      fieldErrors,
      ...options,
    });
  }

  /**
   * Create authentication error response
   */
  createAuthError(
    errorCode: ErrorCode,
    message: string,
    options?: { correlationId?: string; path?: string },
  ): ErrorResponse {
    return this.createErrorResponse(401, errorCode, message, options);
  }

  /**
   * Create authorization error response
   */
  createAuthorizationError(
    message: string = 'Access denied',
    options?: { correlationId?: string; path?: string },
  ): ErrorResponse {
    return this.createErrorResponse(403, ErrorCode.INSUFFICIENT_PERMISSIONS, message, options);
  }

  /**
   * Create not found error response
   */
  createNotFoundError(
    resource: string,
    id?: string | number,
    options?: { correlationId?: string; path?: string },
  ): ErrorResponse {
    const message = id 
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;
    
    return this.createErrorResponse(404, ErrorCode.RESOURCE_NOT_FOUND, message, options);
  }

  /**
   * Create conflict error response
   */
  createConflictError(
    message: string,
    errorCode: ErrorCode = ErrorCode.DUPLICATE_RESOURCE,
    options?: { correlationId?: string; path?: string; fieldErrors?: FieldError[] },
  ): ErrorResponse {
    return this.createErrorResponse(409, errorCode, message, options);
  }

  /**
   * Create internal server error response
   */
  createInternalError(
    message: string = 'Internal server error',
    options?: { correlationId?: string; path?: string; originalError?: any },
  ): ErrorResponse {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return this.createErrorResponse(500, ErrorCode.INTERNAL_SERVER_ERROR, message, {
      ...options,
      ...(isDevelopment && options?.originalError && {
        meta: {
          originalError: typeof options.originalError === 'string' 
            ? options.originalError 
            : options.originalError.message,
          stack: options.originalError.stack,
        },
      }),
    });
  }

  /**
   * Create rate limit error response
   */
  createRateLimitError(
    message: string = 'Too many requests',
    options?: { correlationId?: string; path?: string },
  ): ErrorResponse {
    return this.createErrorResponse(429, ErrorCode.RATE_LIMIT_EXCEEDED, message, options);
  }

  /**
   * Create database error response
   */
  createDatabaseError(
    message: string = 'Database error occurred',
    options?: { correlationId?: string; path?: string; originalError?: any },
  ): ErrorResponse {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return this.createErrorResponse(500, ErrorCode.DATABASE_ERROR, message, {
      ...options,
      ...(isDevelopment && options?.originalError && {
        meta: {
          originalError: options.originalError.message,
        },
      }),
    });
  }

  /**
   * Format field errors from validation library
   */
  formatFieldErrors(validationErrors: any[]): FieldError[] {
    const fieldErrors: FieldError[] = [];

    validationErrors.forEach(error => {
      if (error.constraints) {
        fieldErrors.push({
          field: error.property,
          message: Object.values(error.constraints).join(', '),
          rejectedValue: error.value,
        });
      }

      // Handle nested validation errors
      if (error.children && Array.isArray(error.children)) {
        error.children.forEach((childError: any) => {
          fieldErrors.push(...this.formatFieldErrors([childError]));
        });
      }
    });

    return fieldErrors;
  }

  /**
   * Sanitize error message for production
   */
  sanitizeMessage(message: string): string {
    // Remove potentially sensitive information
    const patterns = [
      /password\s*[:=]\s*\S+/gi,
      /token\s*[:=]\s*\S+/gi,
      /secret\s*[:=]\s*\S+/gi,
      /api[_-]?key\s*[:=]\s*\S+/gi,
      /\b\d{16}\b/g, // Credit card numbers
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Emails (optional)
    ];

    let sanitized = message;
    patterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }
}
