import { Injectable } from "@nestjs/common";
import { AgoraTokenService } from "./agora-token.service";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { PodcastRepository } from "src/repositories/podcast.repository";
import { Podcast } from "src/entity/podcast.entity";
import { AgoraStopResponseDto } from "src/dto/agora-stop-response.dto";
import { VideoRepository } from "src/repositories/video.repository";
import { VideoDto } from "src/dto/video.dto";

@Injectable()
export class AgoraRecordingService {
    private baseUrl = 'https://api.agora.io/v1/apps';

    constructor(
        private agoraTokenService: AgoraTokenService,
        private http: HttpService,
        private podcastRepository: PodcastRepository,
        private videoRepository: VideoRepository) { }

    async getResourceId(channelName: string, userId: string) {
        // const uid = `${channelName}_${crypto.randomUUID()}`;
        console.log('channel name: ', channelName)
        const uid = Math.floor(Math.random() * 100000000);
        const url = `${this.baseUrl}/${process.env.AGORA_APP_ID}/cloud_recording/acquire`;
        const payload = {
            cname: channelName,
            uid: `${uid}`,
            clientRequest: {}
        }
        console.log('getting resourceId', payload);

        console.log('agora token: ', this.agoraTokenService.createBasicAuthToken());
        const { data } = await firstValueFrom(this.http.post<{ resourceId: string }>(url,
            payload,
            { headers: { Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}` }, }));

        console.log('resourceId: ', data.resourceId);
        // TODO: Add podcast status
        const dto = {
            resourceId: data.resourceId,
            uid,
            auth0UserId: userId,
            channelName
        } as Podcast;
        console.log('podcast dto: ', dto);
        await this.podcastRepository.addPodcast(dto);

        return data.resourceId;
    }

    async startRecording(channelName: string) {
        const podcast = await this.podcastRepository.getPodcast(channelName);
        const url = `${this.baseUrl}/${process.env.AGORA_APP_ID}/cloud_recording/resourceid/${encodeURIComponent(podcast.resourceId)}/mode/mix/start`;
        const token = await this.agoraTokenService.createTokens(`${podcast.uid}`, podcast.channelName);
        const payload = {
            cname: channelName,
            uid: `${podcast.uid}`,
            clientRequest: {
                token: token.rtcToken,
                storageConfig: {
                    vendor: 1,
                    region: 2,
                    bucket: process.env.AWS_S3_BUCKET,
                    accessKey: process.env.AGORA_S3_ACCESS_KEY,
                    secretKey: process.env.AGORA_S3_SECRET,
                    fileNamePrefix: ['uploads', 'agora']
                },
                recordingConfig: {
                    channelType: 0,
                    // mode: 'mix',
                    maxIdleTime: 120
                },
                recordingFileConfig: {
                    avFileType: ["hls", "mp4"]
                }
            }
        }
        console.log('starting recording payload :', payload);

        const { data } = await firstValueFrom(this.http.post<{ sid: string }>(url,
            payload,
            { headers: { Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}` }, })
        );

        console.log('start recording response ', data);
        // TODO: Add podcast status
        const dto = {
            sid: data.sid,
            channelName
        } as Podcast;
        console.log('poadcast entity update: ', dto);
        await this.podcastRepository.updatePodcast(dto);

        return data.sid;
    }

    async stopRecording(channelName: string) {
        const podcast = await this.podcastRepository.getPodcast(channelName);
        const url = `${this.baseUrl}/${process.env.AGORA_APP_ID}/cloud_recording/resourceid/${encodeURIComponent(podcast.resourceId)}/sid/${podcast.sid}/mode/mix/stop`;

        const payload = {
            cname: channelName,
            uid: `${podcast.uid}`,
            clientRequest: {}
        }
        console.log('stopping recording payload: ', payload);
        const { data } = await firstValueFrom(this.http.post<AgoraStopResponseDto>(url,
            payload,
            { headers: { Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}` }, })
        );

        console.log('stopping recording response from agora: ', data);
        console.log('filelist: ', data.serverResponse);
        // TODO: update podcast entity with stopped status
        console.log(data.serverResponse.fileList.find(f => f.fileName.endsWith('.mp4')));

        const videoDto = {
            user: podcast.auth0UserId,
            videoPath: data.serverResponse.fileList.find(f => f.fileName.endsWith('.mp4'))?.fileName
        } as VideoDto;
        console.log('creating s3 video record: ', videoDto);
        await this.videoRepository.create(videoDto);
    }
}