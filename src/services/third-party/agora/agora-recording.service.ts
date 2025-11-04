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
            recordingUid: uid,
            auth0UserId: userId,
            channelName
        } as Podcast;
        console.log('podcast dto: ', dto);
        await this.podcastRepository.addPodcast(dto);

        return data.resourceId;
    }

    async startRecording(channelName: string, users: number[]) {
        const podcast = await this.podcastRepository.getPodcast(channelName);
        // users.push(podcast.)
        const url = `${this.baseUrl}/${process.env.AGORA_APP_ID}/cloud_recording/resourceid/${encodeURIComponent(podcast.resourceId)}/mode/mix/start`;
        const token = await this.agoraTokenService.createTokens(`${podcast.recordingUid}`, podcast.channelName);
        const payload = {
            cname: channelName,
            uid: String(podcast.recordingUid),     // recorder UID
            clientRequest: {
                token: token.rtcToken,

                storageConfig: {
                    vendor: 1,                         // 1 = AWS S3
                    region: 2,                         // your numeric region
                    bucket: process.env.AWS_S3_BUCKET,
                    accessKey: process.env.AGORA_S3_ACCESS_KEY,
                    secretKey: process.env.AGORA_S3_SECRET,
                    fileNamePrefix: ["uploads", "agora"]
                },

                // ✅ make sure we subscribe to ALL audio/video streams
                recordingConfig: {
                    channelType: 0,
                    maxIdleTime: 120,
                    subscribeAudioUids: ["#allstream#"],
                    subscribeVideoUids: ["#allstream#"],
                    transcodingConfig: {
                        width: 1280,
                        height: 720,
                        fps: 15,
                        bitrate: 1200,
                        mixedVideoLayout: 1,
                    },
                },

                recordingFileConfig: {
                    avFileType: ["hls", "mp4"]         // mp4-only is not allowed
                }
            }
        };

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
            uid: `${podcast.recordingUid}`,
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

    private getRecordingConfiguration(users: number[]): { uid: string, x_axis: number, y_axis: number, width: number, height: number }[] {
        const count = users.length;
        const configs = [] as { uid: string, x_axis: number, y_axis: number, width: number, height: number }[];

        if (count === 1) {
            configs.push({ uid: `${users[0]}`, x_axis: 0, y_axis: 0, width: 1, height: 1 });
        } else if (count === 2) {
            configs.push({ uid: `${users[0]}`, x_axis: 0, y_axis: 0, width: 0.5, height: 1 });
            configs.push({ uid: `${users[1]}`, x_axis: 0.5, y_axis: 0, width: 0.5, height: 1 });
        } else if (count === 3) {
            configs.push({ uid: `${users[0]}`, x_axis: 0, y_axis: 0, width: 0.5, height: 0.5 });
            configs.push({ uid: `${users[1]}`, x_axis: 0.5, y_axis: 0, width: 0.5, height: 0.5 });
            configs.push({ uid: `${users[2]}`, x_axis: 0.25, y_axis: 0.5, width: 0.5, height: 0.5 });
        } else {
            // 4+ users: 2x2 grid
            const grid = [
                [0, 0],
                [0.5, 0],
                [0, 0.5],
                [0.5, 0.5]
            ];
            for (let i = 0; i < Math.min(4, users.length); i++) {
                const [x, y] = grid[i];
                configs.push({ uid: `${users[i]}`, x_axis: x, y_axis: y, width: 0.5, height: 0.5 });
            }
        }
        console.log('recording configs: ', configs);
        return configs;
    }

}