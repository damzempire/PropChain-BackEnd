import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, FieldError } from './error.types';

/**
 * Base application exception with error codes and metadata
 */
export class AppException extends HttpException {
  public readonly code!: ErrorCode;
  public readonly fieldErrors?: FieldError[];
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code: ErrorCode,
    status: HttpStatus,
    fieldErrors?: FieldError[],
    context?: Record<string, any>,
    originalError?: any,
  ) {
    const response: any = {
      message,
      code,
      ...(fieldErrors && { details: fieldErrors }),
      ...(context && { context }),
      ...(originalError && { originalError: typeof originalError === 'string' ? originalError : originalError.message }),
    };

    super(response, status);
    Object.defineProperty(this, 'code', { value: code, enumerable: true });
    Object.defineProperty(this, 'fieldErrors', { value: fieldErrors, enumerable: true });
    Object.defineProperty(this, 'context', { value: context, enumerable: true });
  }
}

/**
 * Authentication errors (401)
 */
export class AuthenticationException extends AppException {
  constructor(
    message = 'Authentication required',
    code: ErrorCode = ErrorCode.AUTH_INVALID_TOKEN,
    context?: Record<string, any>,
  ) {
    super(message, code, HttpStatus.UNAUTHORIZED, undefined, context);
  }
}

export class TokenExpiredException extends AuthenticationException {
  constructor(context?: Record<string, any>) {
    super('Token has expired', ErrorCode.AUTH_TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
    if (context) {
      Object.defineProperty(this, 'context', { value: context, enumerable: true });
    }
  }
}

export class InvalidCredentialsException extends AuthenticationException {
  constructor(message = 'Invalid credentials') {
    super(message, ErrorCode.AUTH_INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
  }
}

/**
 * Authorization errors (403)
 */
export class AuthorizationException extends AppException {
  constructor(
    message = 'Access denied',
    code: ErrorCode = ErrorCode.INSUFFICIENT_PERMISSIONS,
    context?: Record<string, any>,
  ) {
    super(message, code, HttpStatus.FORBIDDEN, undefined, context);
  }
}

/**
 * Validation errors (400)
 */
export class ValidationException extends AppException {
  constructor(
    message = 'Validation failed',
    fieldErrors: FieldError[],
  ) {
    super(message, ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, fieldErrors);
  }
}

/**
 * Not found errors (404)
 */
export class NotFoundException extends AppException {
  constructor(
    resource: string,
    id?: string | number,
  ) {
    const message = id 
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;
    
    super(message, ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
  }
}

/**
 * Conflict errors (409)
 */
export class ConflictException extends AppException {
  constructor(
    message = 'Resource conflict',
    code: ErrorCode = ErrorCode.DUPLICATE_RESOURCE,
    fieldErrors?: FieldError[],
  ) {
    super(message, code, HttpStatus.CONFLICT, fieldErrors);
  }
}

export class DuplicateResourceException extends ConflictException {
  constructor(resource: string, field?: string) {
    const message = field 
      ? `A ${resource} with this ${field} already exists`
      : `Duplicate ${resource}`;
    
    super(message, ErrorCode.DUPLICATE_RESOURCE);
  }
}

/**
 * Rate limit exceeded (429)
 */
export class RateLimitException extends AppException {
  constructor(message = 'Too many requests') {
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * Database errors (500/503)
 */
export class DatabaseException extends AppException {
  constructor(
    message = 'Database error occurred',
    originalError?: any,
  ) {
    super(
      message,
      ErrorCode.DATABASE_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      undefined,
      undefined,
      originalError,
    );
  }
}

export class DatabaseConnectionException extends DatabaseException {
  constructor(originalError?: any) {
    super('Unable to connect to database', originalError);
    Object.defineProperty(this, 'code', { value: ErrorCode.DATABASE_CONNECTION_FAILED, enumerable: true });
    Object.defineProperty(this, 'status', { value: HttpStatus.SERVICE_UNAVAILABLE, enumerable: true });
  }
}

/**
 * Internal server error (500)
 */
export class InternalServerException extends AppException {
  constructor(
    message = 'Internal server error',
    originalError?: any,
    context?: Record<string, any>,
  ) {
    super(message, ErrorCode.INTERNAL_SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, undefined, context, originalError);
  }
}

/**
 * Service unavailable (503)
 */
export class ServiceUnavailableException extends AppException {
  constructor(message = 'Service temporarily unavailable') {
    super(message, ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
