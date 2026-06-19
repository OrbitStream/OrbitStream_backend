import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { createSecurityMiddleware } from './api/middleware/security.middleware';
import { resolveJwtSecrets } from './config/jwt-secret.config';
import { resolveAllowedOrigins } from './api/middleware/cors.config';

async function bootstrap() {
  // Fail fast on insecure / missing configuration before binding the port.
  resolveJwtSecrets();
  resolveAllowedOrigins();

  const app = await NestFactory.create(AppModule);

  // Trust the first proxy hop so client IPs (X-Forwarded-For) resolve correctly
  // for rate limiting behind a load balancer.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Dynamic CORS + security headers (replaces the permissive app.enableCors()).
  app.use(createSecurityMiddleware());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`OrbitStream API running on port ${port}`);
}

bootstrap();
