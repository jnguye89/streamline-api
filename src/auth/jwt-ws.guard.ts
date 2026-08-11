// ws-jwt.guard.ts
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Socket } from 'socket.io';

interface JwtUser {
  sub: string;
}

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  { user?: JwtUser; userId?: string }
>;

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

@Injectable()
export class WsJwtGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return (await super.canActivate(context)) as boolean;
  }
  // Tell passport where to get the "request" for this context
  getRequest(context: ExecutionContext): {
    headers: { authorization?: string };
  } {
    const wsContext = context.switchToWs();
    const client = wsContext.getClient<AuthenticatedSocket>();

    const authHeader = getString(client.handshake.headers.authorization);
    const handshakeAuth = client.handshake.auth as unknown;
    const tokenFromAuth =
      typeof handshakeAuth === 'object' && handshakeAuth !== null
        ? getString(Reflect.get(handshakeAuth, 'token'))
        : undefined;
    const tokenFromQuery = getString(client.handshake.query.token);

    const bearer =
      authHeader ??
      (tokenFromAuth ? `Bearer ${tokenFromAuth}` : undefined) ??
      (tokenFromQuery ? `Bearer ${tokenFromQuery}` : undefined);

    return {
      headers: {
        authorization: bearer,
      },
    };
  }

  // Attach the validated user to the socket
  handleRequest<TUser = JwtUser>(
    error: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (error instanceof Error) {
      throw error;
    }
    if (
      typeof user !== 'object' ||
      user === null ||
      typeof Reflect.get(user, 'sub') !== 'string'
    ) {
      throw new UnauthorizedException(
        typeof info === 'string' ? info : 'Invalid authentication token',
      );
    }

    const authenticatedUser = user as JwtUser;
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    client.data.user = authenticatedUser;
    client.data.userId = authenticatedUser.sub;
    return authenticatedUser as unknown as TUser;
  }
}
