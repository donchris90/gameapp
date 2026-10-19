import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new UnauthorizedException();
    }
    // One cheap lookup so a ban or suspension takes effect immediately,
    // not when the access token eventually expires.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, status: true } });
    if (!user) throw new UnauthorizedException();
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');
    req.user = { id: user.id, role: user.role };
    return true;
  }
}
