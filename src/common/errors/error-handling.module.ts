import { Module, OnModuleInit } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { ErrorFormatterService } from './error-formatter.service';

/**
 * Error Handling Module
 * 
 * Provides centralized error handling across the entire application
 * with consistent formatting, logging, and HTTP responses.
 */
@Module({
  providers: [
    // Register global exception filter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    ErrorFormatterService,
  ],
  exports: [ErrorFormatterService],
})
export class ErrorHandlingModule implements OnModuleInit {
  onModuleInit() {
    // Log that error handling is initialized
    console.log('✅ Error handling module initialized - Global exception filter active');
  }
}
