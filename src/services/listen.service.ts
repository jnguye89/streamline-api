import { Injectable } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { HttpService } from '@nestjs/axios';
import { Observable } from 'rxjs';
import { AxiosResponse } from 'axios';
import { RadioStation } from 'src/models/radio-stations.model';

@Injectable()
export class ListenService {
  constructor(
    private firebaseService: FirebaseService,
    private readonly httpService: HttpService,
  ) {}

  getRandomStations(
    quantity: number,
  ): Observable<AxiosResponse<RadioStation[]>> {
    const url = `https://de1.api.radio-browser.info/json/stations/topclick/${quantity}`;
    return this.httpService.get(url);
  }
}
