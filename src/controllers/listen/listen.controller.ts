import { Controller, Get, Param } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { Public } from './../../auth/public.decorator';
import { ListenService } from 'src/services/listen.service';

@Controller('listen')
export class ListenController {
  constructor(private listenService: ListenService) {}

  @Get('stations/:quantity')
  @Public()
  async getRandomStations(@Param('quantity') quantity: number) {
    const response = await firstValueFrom(
      this.listenService.getRandomStations(quantity),
    );
    return response.data.map((station) => ({
      name: station.name,
      url: station.url,
    }));
  }
}
