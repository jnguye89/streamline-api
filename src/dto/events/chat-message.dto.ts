import { IsBoolean, IsString, MaxLength } from "class-validator";

export class ChatMessageDto {
    @IsString()
    roomId!: string;

    @IsString()
    @MaxLength(500)
    text!: string;
}

export class RecordingDto {
    @IsString()
    roomId!: string;

    @IsBoolean()
    isRecording!: boolean;

    @IsString()
    streamName: string;

    @IsString()
    agoraUserId: number;
}