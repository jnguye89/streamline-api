import { IsBoolean, IsString } from "class-validator";

export class RecordingDto {
    @IsString()
    roomId!: string;

    @IsBoolean()
    isRecording!: boolean;
}