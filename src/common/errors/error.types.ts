/**
 * Error codes for programmatic error handling
 */
export enum ErrorCode {
  // Authentication errors (401)
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_MISSING_TOKEN = 'AUTH_MISSING_TOKEN',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
  
  // Authorization errors (403)
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ACCESS_DENIED = 'ACCESS_DENIED',
  ROLE_REQUIRED = 'ROLE_REQUIRED',
  
  // Validation errors (400)
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_REQUEST_BODY = 'INVALID_REQUEST_BODY',
  INVALID_QUERY_PARAMS = 'INVALID_QUERY_PARAMS',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Not found errors (404)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  ENDPOINT_NOT_FOUND = 'ENDPOINT_NOT_FOUND',
  
  // Conflict errors (409)
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  UNIQUE_CONSTRAINT_VIOLATION = 'UNIQUE_CONSTRAINT_VIOLATION',
  
  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Database errors (500/503)
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  DATABASE_TIMEOUT = 'DATABASE_TIMEOUT',
  
  // Server errors (500)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // File errors (400/413/415)
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',
}

/**
 * Field-specific validation error
 */
export interface FieldError {
  /** Field name that has the error */
  field: string;
  /** Error message for this field */
  message: string;
  /** Invalid value (optional) */
  rejectedValue?: any;
}

/**
 * Standardized error response structure
 */
export interface ErrorResponse {
  /** HTTP status code */
  statusCode: number;
  /** Error code for programmatic handling */
  errorCode: ErrorCode | string;
  /** User-friendly error message */
  message: string;
  /** Field-specific errors (for validation errors) */
  details?: FieldError[];
  /** Request correlation ID for tracking */
  correlationId?: string;
  /** Timestamp when error occurred */
  timestamp: string;
  /** Request path */
  path: string;
  /** Additional error metadata (only in development) */
  meta?: {
    stack?: string;
    context?: Record<string, any>;
    originalError?: any;
  };
}

/**
 * Base exception interface
 */
export interface AppException {
  /** Error code */
  code: ErrorCode;
  /** Human-readable message */
  message: string;
  /** HTTP status code */
  status: number;
  /** Field errors (if validation error) */
  fieldErrors?: FieldError[];
  /** Original error (for wrapping) */
  originalError?: any;
  /** Additional context */
  context?: Record<string, any>;
}
