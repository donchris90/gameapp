import 'reflect-metadata';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // The admin website runs in a browser on another address, so that address must be allowed explicitly.
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length > 0) app.enableCors({ origin: origins });
  app.enableShutdownHooks();
  await app.listen(config.port);
}
bootstrap();
