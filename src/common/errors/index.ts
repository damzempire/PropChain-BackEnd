/**
 * Error Handling Module - Public API
 * 
 * Centralized error handling with consistent formatting and proper HTTP responses
 */

// Types and interfaces
export { ErrorCode, FieldError, ErrorResponse } from './error.types';

// Exception classes
export {
  AppException,
  AuthenticationException,
  TokenExpiredException,
  InvalidCredentialsException,
  AuthorizationException,
  ValidationException,
  NotFoundException,
  ConflictException,
  DuplicateResourceException,
  RateLimitException,
  DatabaseException,
  DatabaseConnectionException,
  InternalServerException,
  ServiceUnavailableException,
} from './exceptions';

// Services
export { ErrorFormatterService } from './error-formatter.service';

// Module
export { ErrorHandlingModule } from './error-handling.module';
