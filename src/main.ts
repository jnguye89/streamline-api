import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// import * as bodyParser from 'body-parser';
// import { MulterExceptionFilter } from './controllers/video/multer';
import { AllExceptionsFilter } from './controllers/all-exceptions.filter';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
// import { IoAdapter } from '@nestjs/platform-socket.io';
import { ClassSerializerInterceptor } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // app.use(bodyParser.json({ limit: '100mb' }));
  // app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
  // app.useGlobalFilters(new MulterExceptionFilter());
  app.useGlobalFilters(new AllExceptionsFilter());
  // app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    credentials: true,
  });
  const port = process.env.PORT ?? 3000;
  console.log('using port', port);
  await app.listen(port, '0.0.0.0');
}
bootstrap();
