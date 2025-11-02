export class AgoraStopResponseDto {
    cname: string;
    resourceId: string;
    sid: string;
    serverResponse: {
        fileList: { fileName: string, trackType: string, uid: string }[];
    }
}