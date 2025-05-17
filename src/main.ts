import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('CORS_ORIGIN', process.env.CORS_ORIGIN);
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
