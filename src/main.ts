import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { MulterExceptionFilter } from './controllers/video/muelter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(bodyParser.json({ limit: '100mb' }));
  app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
  app.useGlobalFilters(new MulterExceptionFilter());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
