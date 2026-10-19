import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
