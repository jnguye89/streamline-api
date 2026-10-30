import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/** Admins are listed by Auth0 user id in ADMIN_USER_IDS, comma-separated. */
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .includes(userId);
}

/** For moderation routes. Runs after the global JWT guard, so request.user is set. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { sub?: string } }>();
    if (!isAdmin(request.user?.sub)) {
      throw new ForbiddenException('Admins only');
    }
    return true;
  }
}
