import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { validationExceptionFactory } from './common/utils/validation-exception.factory.js';
import { getAllowedOrigins } from './common/utils/allowed-origins.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableCors({ origin: getAllowedOrigins(), credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
