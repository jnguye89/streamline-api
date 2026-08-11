import { Test, TestingModule } from '@nestjs/testing';
import { ListenService } from '../../services/listen.service';
import { S3Service } from '../../services/third-party/s3.service';
import { ListenController } from './listen.controller';

describe('ListenController', () => {
  let controller: ListenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListenController],
      providers: [
        { provide: ListenService, useValue: {} },
        { provide: S3Service, useValue: {} },
      ],
    }).compile();

    controller = module.get<ListenController>(ListenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
