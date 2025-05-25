import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserModel } from 'src/models/user.model';

export const User = createParamDecorator(
  (data: keyof any, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = {
      userId: request.user.sub,
    } as UserModel;
    return user;
  },
);
