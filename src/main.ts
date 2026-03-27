import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { compressionMiddleware } from './middleware/compression.middleware';
import { AppModule } from './app.module';
import { StructuredLoggerService } from './common/logging/logger.service';
import { ErrorResponseDto } from './common/errors/error.dto';
import { SecurityHeadersService } from './security/services/security-headers.service';
import { DEFAULT_API_VERSION } from './common/api-version';
import { CorsOriginValidator } from './config/utils/cors-origin.validator';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';
import { DataSource } from 'typeorm';
import { connectWithRetry } from './database/retry-connection';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = await app.resolve(StructuredLoggerService);
  app.useLogger(logger);

  // Security middleware
  app.use(helmet());
  app.use(compressionMiddleware(configService));

  // Enhanced security headers
  const securityHeadersService = app.get(SecurityHeadersService);
  const isProduction = configService.get('NODE_ENV') === 'production';
  const securityConfig = isProduction
    ? undefined
    : securityHeadersService.getDevelopmentConfig();

  // Environment validation
  const { EnvValidator } = await import('./config/utils/env.validator');
  EnvValidator.initialize(configService);
  const validation = EnvValidator.validateOnStartup();

  if (!validation.isValid) {
    logger.error('❌ Configuration validation failed:', validation.errors.join('\n'), {});
    if (isProduction) {
      logger.error('Critical configuration missing. Shutting down.', '', {});
      process.exit(1);
    }
  } else {
    logger.log('✅ Configuration validation passed');
  }

  // Security config warnings
  if (isProduction) {
    const configErrors = securityHeadersService.validateConfig(securityHeadersService['defaultConfig']);
    if (configErrors.length > 0) {
      logger.warn(`Security configuration warnings: ${configErrors.join(', ')}`);
    }
  }

  // Apply security headers
  const securityHeaders = securityHeadersService.getSecurityHeaders(securityConfig);
  app.use((req: any, res: any, next: () => void) => {
    Object.entries(securityHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    next();
  });
  logger.log(`Security headers configured: ${Object.keys(securityHeaders).length} headers applied`);

  // CORS configuration
  const corsOrigin = configService.get('CORS_ORIGIN');
  const nodeEnv = configService.get('NODE_ENV', 'development');
  const validatedOrigins = CorsOriginValidator.validate(corsOrigin, nodeEnv);

  if (!validatedOrigins) {
    logger.error('Invalid CORS configuration detected. Application cannot start with insecure CORS settings.');
    if (nodeEnv === 'production' || nodeEnv === 'staging') {
      process.exit(1);
    }
  }

  const corsOrigins = CorsOriginValidator.parseForNestJs(corsOrigin);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id'],
  });
  logger.log(`CORS configured with origins: ${corsOrigins.join(', ')}`);

  // Global filters & pipes
  app.useGlobalFilters(new ValidationExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validateCustomDecorators: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // API prefix & versioning
  const apiPrefix = configService.get('API_PREFIX', 'api');
  const useVersioning = configService.get('API_VERSIONING_ENABLED', true);
  if (useVersioning) {
    app.setGlobalPrefix(`${apiPrefix}/v${DEFAULT_API_VERSION}`);
    logger.log(`API versioning enabled: v${DEFAULT_API_VERSION}`);
  } else {
    app.setGlobalPrefix(apiPrefix);
  }

  // Swagger docs
  if (configService.get('SWAGGER_ENABLED', true)) {
    const config = new DocumentBuilder()
      .setTitle('PropChain API')
      .setDescription('Decentralized Real Estate Infrastructure - Backend API')
      .setVersion(DEFAULT_API_VERSION)
      .addTag('auth')
      .addTag('users')
      .addTag('properties')
      .addTag('transactions')
      .addTag('valuation')
      .addTag('documents')
      .addTag('blockchain')
      .addTag('Audit & Compliance')
      .addTag('search')
      .addTag('security')
      .addTag('health')
      .addTag('backup-recovery')
      .addTag('API Keys')
      .addTag('feature-flags')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'apiKey')
      .addApiKey({ type: 'apiKey', name: 'Accept-Version', in: 'header' }, 'version')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      extraModels: [ErrorResponseDto],
    });
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      customSiteTitle: 'PropChain API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
    logger.log(`Swagger documentation available at /${apiPrefix}/docs`);
  }

  // Database connection with retry logic
  const dataSource = app.get(DataSource);
  await connectWithRetry(dataSource, 5, 2000);

  // Start server
  const port = configService.get<number>('PORT', 3000);
  const host = configService.get<string>('HOST', '0.0.0.0');
  await app.listen(port, host);

  logger.log(`🚀 PropChain Backend is running on: http://${host}:${port}/${apiPrefix}`);
  logger.log(`🏠 Environment: ${configService.get('NODE_ENV', 'development')}`);
  logger.log(`📊 Health check: http://${host}:${port}/${apiPrefix}/health`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    logger.log('SIGINT signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch(async (error) => {
  const tempLogger = new (await import('./common/logging/logger.service')).StructuredLoggerService(null);
  tempLogger.setContext('Main');
  tempLogger.error('Failed to start application:', error.stack, {});
  process.exit(1);
});
