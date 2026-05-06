import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './workers/worker.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule);

  console.log('Video worker started');
}

bootstrap();