import { Test, TestingModule } from '@nestjs/testing';
import { IvsService } from '../../services/third-party/ivs.services';
import { VideoService } from '../../services/video.service';
import { VideoController } from './video.controller';

describe('VideoController', () => {
  let controller: VideoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideoController],
      providers: [
        { provide: VideoService, useValue: {} },
        { provide: IvsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<VideoController>(VideoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
