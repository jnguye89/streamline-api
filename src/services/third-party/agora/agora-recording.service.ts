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
        //console.log('channel name: ', channelName)
        const uid = Math.floor(Math.random() * 100000000);
        const url = `${this.baseUrl}/${process.env.AGORA_APP_ID}/cloud_recording/acquire`;
        const payload = {
            cname: channelName,
            uid: `${uid}`,
            clientRequest: {}
        }
        //console.log('getting resourceId', payload);

        //console.log('agora token: ', this.agoraTokenService.createBasicAuthToken());
        const { data } = await firstValueFrom(this.http.post<{ resourceId: string }>(url,
            payload,
            { headers: { Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}` }, }));

        //console.log('resourceId: ', data.resourceId);
        // TODO: Add podcast status
        const dto = {
            resourceId: data.resourceId,
            recordingUid: uid,
            auth0UserId: userId,
            channelName
        } as Podcast;
        //console.log('podcast dto: ', dto);
        await this.podcastRepository.addPodcast(dto);

        return data.resourceId;
    }

    async startRecording(channelName: string) {
        const podcast = await this.podcastRepository.getPodcast(channelName);
        const url = `${this.baseUrl}/${process.env.AGORA_APP_ID}/cloud_recording/resourceid/${encodeURIComponent(podcast.resourceId)}/mode/mix/start`;
        const token = await this.agoraTokenService.createTokens(String(podcast.recordingUid), podcast.channelName);
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
                },
                // callbackUrl: "https://70e4d0d5bb25.ngrok-free.app/call/agora/webhook"//?token=supersecret"
            }
        };

        //console.log('starting recording payload :', payload);

        const { data } = await firstValueFrom(this.http.post<{ sid: string }>(url,
            payload,
            { headers: { Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}` }, })
        );

        //console.log('start recording response ', data);

        const queryUrl = `https://api.agora.io/v1/apps/09f3d1aa5ac64ffe95165c9a0a2b27e0/cloud_recording/resourceid/${podcast.resourceId}/sid/${data.sid}/mode/mix/query`
        //console.log('query Url: ', queryUrl);
        const result = await firstValueFrom(this.http.get(queryUrl,
            { headers: { Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}` }, }
        ))
        //console.log('query result: ', result.data);
        // setTimeout(() => {
        //     this.http
        //         .get(queryUrl, {
        //             headers: {
        //                 Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}`,
        //             },
        //         })
        //         .subscribe({
        //             next: (res: any) => {
        //                 //console.log("query after 5s:", res);
        //             },
        //             error: (err) => {
        //                 //console.error("query 5s error:", err?.error ?? err);
        //             },
        //         });
        // }, 5000);
        // TODO: Add podcast status
        const dto = {
            sid: data.sid,
            channelName
        } as Podcast;
        //console.log('poadcast entity update: ', dto);
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
        //console.log('stopping recording payload: ', payload);
        const { data } = await firstValueFrom(this.http.post<AgoraStopResponseDto>(url,
            payload,
            { headers: { Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}` }, })
        );

        //console.log('stopping recording response from agora: ', data);
        //console.log('filelist: ', data.serverResponse);
        // TODO: update podcast entity with stopped status
        //console.log(data.serverResponse.fileList.find(f => f.fileName.endsWith('.mp4')));

        const videoDto = {
            user: podcast.auth0UserId,
            videoPath: data.serverResponse.fileList.find(f => f.fileName.endsWith('.mp4'))?.fileName
        } as VideoDto;
        //console.log('creating s3 video record: ', videoDto);
        await this.videoRepository.create(videoDto);
    }
}