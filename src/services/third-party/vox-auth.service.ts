import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

import { VoxCreds } from 'src/dto/vox-creds.interface';

@Injectable()
export class VoxAuthService {
  private readonly log = new Logger(VoxAuthService.name);
  private cached?: { token: string; exp: number };
  private readonly creds: VoxCreds;

  constructor() {
    this.creds = {
      account_id: Number(process.env.VOXI_ACCOUNT_ID),
      key_id: process.env.VOXI_KEY_ID!,
      private_key: (process.env.VOXI_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    };
  }

  /** Returns a valid JWT, re-signing 5 minutes before expiry */
  getToken(): string {
    if (
      !Number.isFinite(this.creds.account_id) ||
      !this.creds.key_id ||
      !this.creds.private_key.includes('BEGIN PRIVATE KEY')
    ) {
      throw new Error('Voxi service-account credentials missing or malformed');
    }

    const now = Math.floor(Date.now() / 1_000);
    if (this.cached && now < this.cached.exp - 300) {
      return this.cached.token;
    }

    const payload = { iss: this.creds.account_id, iat: now, exp: now + 3600 };

    const token = jwt.sign(payload, this.creds.private_key, {
      algorithm: 'RS256',
      keyid: this.creds.key_id,
    });

    this.cached = { token, exp: payload.exp };
    this.log.debug('Vox JWT refreshed');
    return token;
  }

  getOneTimeToken(loginKey: string, ha1: string): string {
    if (!ha1) throw new Error('Unknown user');

    return crypto.createHash('md5').update(`${loginKey}|${ha1}`).digest('hex');
  }
}
