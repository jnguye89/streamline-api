import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Observable } from 'rxjs';
import { AxiosResponse } from 'axios';
import { RadioStation } from 'src/models/radio-stations.model';
import { AudioRepository } from 'src/repositories/audio.repository';
import { AudioDto } from 'src/dto/audio.dto';

@Injectable()
export class ListenService {
  constructor(
    private readonly httpService: HttpService,
    private audioRepository: AudioRepository,
  ) {}

  getRandomStations(
    quantity: number,
  ): Observable<AxiosResponse<RadioStation[]>> {
    const url = `https://de1.api.radio-browser.info/json/stations/topclick/${quantity}`;
    return this.httpService.get(url);
  }

  getAllAudios(): Promise<AudioDto[]> {
    return this.audioRepository.findAll();
  }

  async uploadAudioToDb(audioDto: AudioDto): Promise<AudioDto> {
    return this.audioRepository.create(audioDto);
  }
}
