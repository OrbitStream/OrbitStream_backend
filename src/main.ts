import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { resolveJwtSecrets } from './config/jwt-secret.config';

async function bootstrap() {
  // Fail fast on insecure / missing JWT configuration before binding the port.
  resolveJwtSecrets();

  const app = await NestFactory.create(AppModule);

  // Trust the first proxy hop so client IPs (X-Forwarded-For) resolve correctly
  // for rate limiting behind a load balancer.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`OrbitStream API running on port ${port}`);
}

bootstrap();
