// optional-ws-jwt.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Socket } from 'socket.io';

// Same JWT extraction as WsJwtGuard, but never rejects the connection -
// anonymous callers fall through with no client.data.user/userId set,
// while a valid token still attaches the authenticated user.
@Injectable()
export class OptionalWsJwtGuard extends AuthGuard('jwt') {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            await super.canActivate(context);
        } catch {
            // no/invalid token -> proceed anonymously
        }
        return true;
    }

    getRequest(context: ExecutionContext) {
        const wsContext = context.switchToWs();
        const client = wsContext.getClient<Socket>();

        const authHeader = client.handshake.headers['authorization'] as string | undefined;
        const tokenFromAuth = (client.handshake as any).auth?.token as string | undefined;
        const tokenFromQuery = client.handshake.query['token'] as string | undefined;

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

    handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
        if (!err && user) {
            const client = context.switchToWs().getClient<Socket>();
            client.data.user = user;
            client.data.userId = user.sub;
        }
        return user;
    }
}
