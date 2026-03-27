import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from './exceptions';
import { ErrorCode, ErrorResponse } from './error.types';

/**
 * Global exception filter that catches all unhandled errors
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Get correlation ID from request
    const correlationId = this.getCorrelationId(request);

    // Format error response
    const errorResponse = this.formatErrorResponse(exception, request, correlationId);

    // Log error with full context
    this.logError(exception, request, correlationId);

    // Send response
    response.status(errorResponse.statusCode).json(errorResponse);
  }

  /**
   * Get correlation ID from request headers or generate new one
   */
  private getCorrelationId(request: Request): string {
    return (request.headers['x-correlation-id'] as string) || 
           (request as any).correlationId || 
           `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Format error response based on exception type and environment
   */
  private formatErrorResponse(
    exception: any,
    request: Request,
    correlationId: string,
  ): ErrorResponse {
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Handle our custom app exceptions
    if (exception instanceof AppException) {
      return this.formatAppException(exception, request, correlationId, isDevelopment);
    }

    // Handle HttpException from NestJS
    if (exception.getStatus) {
      return this.formatHttpException(exception, request, correlationId, isDevelopment);
    }

    // Handle validation errors from class-validator
    if (exception.name === 'ValidationError') {
      return this.formatValidationError(exception, request, correlationId, isDevelopment);
    }

    // Handle database errors (Prisma, TypeORM, etc.)
    if (this.isDatabaseError(exception)) {
      return this.formatDatabaseError(exception, request, correlationId, isDevelopment);
    }

    // Handle unknown errors - treat as internal server error
    return this.formatUnknownError(exception, request, correlationId, isDevelopment);
  }

  /**
   * Format our custom app exceptions
   */
  private formatAppException(
    exception: AppException,
    request: Request,
    correlationId: string,
    isDevelopment: boolean,
  ): ErrorResponse {
    return {
      statusCode: exception.getStatus(),
      errorCode: exception.code,
      message: exception.message,
      details: exception.fieldErrors,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(isDevelopment && {
        meta: {
          stack: exception.stack,
          context: exception.context,
        },
      }),
    };
  }

  /**
   * Format standard NestJS HttpExceptions
   */
  private formatHttpException(
    exception: any,
    request: Request,
    correlationId: string,
    isDevelopment: boolean,
  ): ErrorResponse {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    
    let message = 'An error occurred';
    let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;

    // Extract message and code from exception response
    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object') {
      message = (exceptionResponse as any).message || message;
      errorCode = (exceptionResponse as any).code || this.mapStatusToErrorCode(status);
    }

    return {
      statusCode: status,
      errorCode,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(isDevelopment && {
        meta: {
          stack: exception.stack,
        },
      }),
    };
  }

  /**
   * Format validation errors
   */
  private formatValidationError(
    exception: any,
    request: Request,
    correlationId: string,
    isDevelopment: boolean,
  ): ErrorResponse {
    const fieldErrors = this.extractFieldErrors(exception);

    return {
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      details: fieldErrors,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(isDevelopment && {
        meta: {
          stack: exception.stack,
        },
      }),
    };
  }

  /**
   * Extract field-specific validation errors
   */
  private extractFieldErrors(exception: any): Array<{ field: string; message: string }> {
    const fieldErrors: Array<{ field: string; message: string }> = [];

    if (exception.constraints) {
      // Single field validation error
      fieldErrors.push({
        field: exception.property,
        message: Object.values(exception.constraints).join(', '),
      });
    } else if (exception.children && Array.isArray(exception.children)) {
      // Nested validation errors
      exception.children.forEach((child: any) => {
        fieldErrors.push(...this.extractFieldErrors(child));
      });
    }

    return fieldErrors;
  }

  /**
   * Check if error is database-related
   */
  private isDatabaseError(exception: any): boolean {
    const errorName = exception.name?.toLowerCase() || '';
    const errorMessage = exception.message?.toLowerCase() || '';
    
    return (
      errorName.includes('prisma') ||
      errorName.includes('queryfailed') ||
      errorName.includes('database') ||
      errorMessage.includes('duplicate') ||
      errorMessage.includes('foreign key') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('connection')
    );
  }

  /**
   * Format database errors
   */
  private formatDatabaseError(
    exception: any,
    request: Request,
    correlationId: string,
    isDevelopment: boolean,
  ): ErrorResponse {
    const errorMessage = exception.message?.toLowerCase() || '';
    
    // Determine specific database error type
    let errorCode = ErrorCode.DATABASE_ERROR;
    let message = 'A database error occurred';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (errorMessage.includes('duplicate')) {
      errorCode = ErrorCode.UNIQUE_CONSTRAINT_VIOLATION;
      message = 'A record with this value already exists';
      status = HttpStatus.CONFLICT;
    } else if (errorMessage.includes('foreign key')) {
      errorCode = ErrorCode.RESOURCE_CONFLICT;
      message = 'This record is referenced by other records';
      status = HttpStatus.CONFLICT;
    } else if (errorMessage.includes('connection') || errorMessage.includes('connect')) {
      errorCode = ErrorCode.DATABASE_CONNECTION_FAILED;
      message = 'Unable to connect to database';
      status = HttpStatus.SERVICE_UNAVAILABLE;
    } else if (errorMessage.includes('timeout')) {
      errorCode = ErrorCode.DATABASE_TIMEOUT;
      message = 'Database operation timed out';
      status = HttpStatus.GATEWAY_TIMEOUT;
    }

    return {
      statusCode: status,
      errorCode,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(isDevelopment && {
        meta: {
          stack: exception.stack,
          originalError: exception.message,
        },
      }),
    };
  }

  /**
   * Format unknown errors as internal server errors
   */
  private formatUnknownError(
    exception: any,
    request: Request,
    correlationId: string,
    isDevelopment: boolean,
  ): ErrorResponse {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: isDevelopment ? exception.message : 'Internal server error',
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(isDevelopment && {
        meta: {
          stack: exception.stack,
          originalError: exception.toString(),
        },
      }),
    };
  }

  /**
   * Map HTTP status to error code
   */
  private mapStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.INVALID_REQUEST_BODY;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_INVALID_TOKEN;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.INSUFFICIENT_PERMISSIONS;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.ENDPOINT_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.RESOURCE_CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }

  /**
   * Log error with full context for debugging
   */
  private logError(exception: any, request: Request, correlationId: string): void {
    const userId = (request as any).user?.id || 'anonymous';
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';

    const errorContext = {
      correlationId,
      userId,
      ip,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      body: this.sanitizeData(request.body),
      queryParams: request.query,
      timestamp: new Date().toISOString(),
    };

    // Log based on error severity
    if (exception instanceof AppException && exception.getStatus() < 500) {
      // Client errors - warn level
      this.logger.warn(
        `Client error: ${exception.message} | Code: ${exception.code} | User: ${userId} | CorrelationID: ${correlationId}`,
        JSON.stringify(errorContext),
      );
    } else {
      // Server errors - error level with stack trace
      this.logger.error(
        `Error: ${exception.message} | Stack: ${exception.stack}`,
        JSON.stringify({
          ...errorContext,
          exception: {
            name: exception.name,
            message: exception.message,
            stack: exception.stack,
          },
        }),
      );
    }
  }

  /**
   * Sanitize sensitive data before logging
   */
  private sanitizeData(data: any): any {
    if (!data) return data;

    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
    const sanitized = { ...data };

    sensitiveFields.forEach(field => {
      const regex = new RegExp(field, 'i');
      Object.keys(sanitized).forEach(key => {
        if (regex.test(key)) {
          sanitized[key] = '[REDACTED]';
        }
      });
    });

    return sanitized;
  }
}
