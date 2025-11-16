// ws-jwt.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard extends AuthGuard('jwt') {
    async canActivate(context: ExecutionContext) {
        return (await super.canActivate(context)) as boolean;
    }
    // Tell passport where to get the "request" for this context
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
                authorization: bearer, // "Bearer eyJ..."
            },
        };
    }

    // Attach the validated user to the socket
    handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
        if (err || !user) {
            throw err || new UnauthorizedException(info);
        }

        const client = context.switchToWs().getClient<Socket>();
        client.data.user = user;
        client.data.userId = user.sub; // Auth0 "sub" claim (e.g. auth0|123)
        return user;
    }
}
