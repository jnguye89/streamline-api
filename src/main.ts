import { ClassSerializerInterceptor } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as bodyParser from 'body-parser';
import { Server as HttpServer } from 'node:http';

import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AllExceptionsFilter } from './controllers/all-exceptions.filter';
import { getCorsOrigins } from './cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(bodyParser.json({ limit: '500mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '500mb' }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  // app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Get the underlying Node HTTP server
  const server = app.getHttpServer() as HttpServer;

  // Allow connections to stay open (so clients can reuse them)
  server.keepAliveTimeout = 70_000; // ms (pick 60–75s)
  server.headersTimeout = 75_000; // MUST be > keepAliveTimeout

  // Enable Socket.IO
  app.useWebSocketAdapter(new IoAdapter(app));

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
  });
  const port = process.env.PORT ?? 3000;
  console.log('using port', port);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
