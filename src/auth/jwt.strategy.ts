import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';

import { auth0Issuers } from './auth0-issuers';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        // Same keys under every issuer name, so the canonical domain's set covers them all.
        jwksUri: `${process.env.AUTH0_ISSUER}.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: process.env.AUTH0_AUDIENCE,
      issuer: auth0Issuers(),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any) {
    return payload; // you can map fields here if needed
  }
}
