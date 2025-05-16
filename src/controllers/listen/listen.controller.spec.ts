import { Test, TestingModule } from '@nestjs/testing';
import { ListenController } from './listen.controller';

describe('ListenController', () => {
  let controller: ListenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListenController],
    }).compile();

    controller = module.get<ListenController>(ListenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
