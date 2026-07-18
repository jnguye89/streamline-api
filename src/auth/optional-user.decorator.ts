import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserModel } from 'src/models/user.model';

export const OptionalUser = createParamDecorator(
  (data: keyof any, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) {
      return null;
    }
    return {
      userId: request.user.sub,
    } as UserModel;
  },
);
