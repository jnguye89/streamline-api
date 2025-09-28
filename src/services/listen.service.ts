import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Observable } from 'rxjs';
import { AxiosResponse } from 'axios';
import { RadioStation } from 'src/models/radio-stations.model';
import { AudioRepository } from 'src/repositories/audio.repository';
import { AudioDto } from 'src/dto/audio.dto';

@Injectable()
export class ListenService {
  constructor(
    private readonly httpService: HttpService,
    private audioRepository: AudioRepository,
  ) { }

  async getRandomStations(
    quantity: number,
  ): Promise<RadioStation[]> {
    const r = await firstValueFrom(this.httpService.get<{ ip: string, name: string }[]>('https://all.api.radio-browser.info/json/servers'));
    console.log(r);

    for (const d of r.data) {
      const url = `https://${d.name}/json/stations/search?limit=${quantity}&hidebroken=true`;
      try {
        const result: AxiosResponse<RadioStation[]> = await firstValueFrom(
          this.httpService.get<RadioStation[]>(url, {
            // optional: don’t throw on 4xx/5xx; then you must check status yourself
            // validateStatus: () => true,
            timeout: 5000,
          })
        );

        // If you DIDN'T set validateStatus, getting here implies 2xx already.
        // If you DID set it, check status range yourself:
        if (result.status >= 200 && result.status < 300 && result.data?.length) {
          return result.data;
        }
      } catch {
        // try next server
        continue;
      }
    }
    throw new Error('All Radio Browser servers failed');
  }

  getAllAudios(): Promise<AudioDto[]> {
    return this.audioRepository.findAll();
  }

  async uploadAudioToDb(audioDto: AudioDto): Promise<AudioDto> {
    return this.audioRepository.create(audioDto);
  }
}
