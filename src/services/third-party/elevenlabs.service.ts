import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import FormData = require('form-data');

@Injectable()
export class ElevenLabsService {
    private readonly apiKey = process.env.ELEVENLABS_API_KEY;

    async isolateAudio(
        inputAudioPath: string,
        outputAudioPath: string,
    ): Promise<void> {
        if (!this.apiKey) {
            throw new Error('Missing ELEVENLABS_API_KEY environment variable');
        }

        const form = new FormData();

        form.append('audio', fs.createReadStream(inputAudioPath), {
            filename: 'input-audio.wav',
            contentType: 'audio/wav',
        });

        form.append('file_format', 'other');

        const response = await axios.post(
            'https://api.elevenlabs.io/v1/audio-isolation/stream',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'xi-api-key': this.apiKey,
                },
                responseType: 'stream',
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 0,
            },
        );

        await pipeline(
            response.data,
            fs.createWriteStream(outputAudioPath),
        );
    }
}