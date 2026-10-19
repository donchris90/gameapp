import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/** Use after JwtAuthGuard. Only accounts with the ADMIN role get through. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.switchToHttp().getRequest().user?.role !== 'ADMIN') throw new ForbiddenException('Admins only');
    return true;
  }
}
