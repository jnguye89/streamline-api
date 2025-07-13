import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { Public } from './../../auth/public.decorator';
import { ListenService } from 'src/services/listen.service';
import { User } from 'src/auth/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserDto } from 'src/dto/user.dto';
import { S3Service } from 'src/services/third-party/s3.service';
import { AudioDto } from 'src/dto/audio.dto';

@Controller('listen')
export class ListenController {
  constructor(
    private listenService: ListenService,
    private s3Service: S3Service,
  ) {}

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

  @Get()
  @Public()
  async getAllAudios(): Promise<AudioDto[]> {
    const dbAudios = await this.listenService.getAllAudios();
    const radioAudio = await this.getRandomStations(100);
    dbAudios.push(
      ...radioAudio.map((audio) => {
        return {
          audioPath: audio.url,
          user: null,
        } as AudioDto;
      }),
    );
    return dbAudios;
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadAudio(
    @User() user: UserDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<string> {
    const url = await this.s3Service.uploadAudioToS3(file);
    await this.listenService.uploadAudioToDb({
      audioPath: url,
      user: `${user.userId}`,
    });
    return url;
  }
}
