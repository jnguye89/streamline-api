// src/calls/dto/agora-token.dto.ts
import { IsString, IsOptional, IsNumber, Min, isNumber } from 'class-validator';

export class CreateAgoraTokenDto {
    @IsNumber() uid!: number;               // your app’s user id (string OK)
    @IsString() channel!: string;           // e.g. "call_123"
    @IsOptional() @IsNumber() @Min(60)
    ttlSeconds?: number;                    // optional override
    // Optional: role = 'publisher' | 'subscriber' (default publisher)
}
