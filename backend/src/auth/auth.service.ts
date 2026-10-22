import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AppConfig, CONFIG } from '../config/config';
import { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { WalletService } from '../wallet/wallet.service';
import { randomCode } from '../common/codes';
import { ageInYears, parseBirthDate } from './age';
import { RESET_MINUTES, checkResetCode, currentWindow, resetCode } from './reset-code';
import { LoginDto, RegisterDto } from './dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function publicUser(u: Pick<User, 'id' | 'email' | 'username' | 'displayName' | 'role' | 'createdAt' | 'friendCode'>) {
  return { id: u.id, email: u.email, username: u.username, displayName: u.displayName, friendCode: u.friendCode, role: u.role, createdAt: u.createdAt };
}

@Injectable()
export class AuthService {
  /** Verified against when the login identifier is unknown, so response time does not reveal which accounts exist. */
  private dummyHash: Promise<string>;
  private readonly lastReset = new Map<string, number>();
  private readonly resetTries = new Map<string, { n: number; until: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wallet: WalletService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly mail: MailService,
  ) {
    this.dummyHash = argon2.hash('not-a-real-password');
  }

  async register(dto: RegisterDto, userAgent?: string) {
    const birth = parseBirthDate(dto.birthDate);
    if (!birth) throw new UnprocessableEntityException('birthDate is not a valid date');
    const now = new Date();
    if (birth > now) throw new UnprocessableEntityException('birthDate is in the future');
    if (ageInYears(birth, now) < this.config.minAgeYears) {
      throw new ForbiddenException({ statusCode: 403, error: 'UNDERAGE', message: `You must be ${this.config.minAgeYears} or older to play` });
    }

    const email = dto.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(dto.password);

    let user: User | undefined;
    for (let attempt = 0; !user; attempt++) {
      try {
        user = await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email, username: dto.username, usernameLower: dto.username.toLowerCase(), displayName: dto.username,
              friendCode: randomCode(8), passwordHash, birthDate: birth, ageConfirmedAt: now, termsAcceptedAt: now,
            },
          });
          await this.wallet.ensureWallet(tx, created.id);
          if (this.config.signupBonusCoins > 0n) {
            await this.wallet.credit(
              { userId: created.id, amount: this.config.signupBonusCoins, type: 'SIGNUP_BONUS', idempotencyKey: `signup:${created.id}` },
              tx,
            );
          }
          return created;
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const target = JSON.stringify(e.meta ?? {});
          if (target.includes('friendCode') && attempt < 5) continue; // astronomically rare code collision: draw another
          throw new ConflictException(target.includes('email') ? 'That email is already registered' : 'That username is taken');
        }
        throw e;
      }
    }

    return { user: publicUser(user), tokens: await this.issueTokens(user, randomUUID(), userAgent) };
  }

  async login(dto: LoginDto, userAgent?: string) {
    const id = dto.identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { OR: [{ email: id }, { usernameLower: id }] } });
    const ok = await argon2.verify(user?.passwordHash ?? (await this.dummyHash), dto.password).catch(() => false);
    if (!user || !ok) throw new UnauthorizedException('Wrong email/username or password');
    this.assertActive(user);
    return { user: publicUser(user), tokens: await this.issueTokens(user, randomUUID(), userAgent) };
  }

  /** Emails a six-digit code. Always answers the same way, so nobody can use it to find out which emails have accounts. */
  async forgotPassword(emailIn: string) {
    const email = emailIn.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status === 'ACTIVE' && !user.isBot) {
      const last = this.lastReset.get(user.id) ?? 0;
      if (Date.now() - last > 45_000) { // at most one email every 45 seconds per account
        this.lastReset.set(user.id, Date.now());
        const code = resetCode(this.config.jwtAccessSecret, user.id, user.passwordHash, currentWindow());
        void this.mail.sendResetCode(user.email, user.displayName, code, RESET_MINUTES);
      }
    }
    return { ok: true };
  }

  async resetPassword(emailIn: string, code: string, newPassword: string) {
    const email = emailIn.trim().toLowerCase();
    const bad = () => new BadRequestException('That code is wrong or has expired. Ask for a new one.');
    const user = await this.prisma.user.findUnique({ where: { email } });
    const tries = this.resetTries.get(email);
    if (tries && tries.until > Date.now() && tries.n >= 5) throw new BadRequestException('Too many wrong codes. Wait 15 minutes, then ask for a new code.');
    if (!user || user.status !== 'ACTIVE' || !checkResetCode(this.config.jwtAccessSecret, user.id, user.passwordHash, code)) {
      const n = tries && tries.until > Date.now() ? tries.n + 1 : 1;
      this.resetTries.set(email, { n, until: Date.now() + 15 * 60_000 });
      throw bad();
    }
    this.resetTries.delete(email);
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }), // sign out every device
    ]);
    return { ok: true };
  }

  async refresh(refreshToken: string, userAgent?: string) {
    const hash = sha256(refreshToken);
    const candidate = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash }, select: { id: true } });
    if (!candidate) throw new UnauthorizedException('Invalid refresh token');

    // Lock the presented token and rotate it in the same transaction. This closes
    // the race where a replay could revoke the family just before a concurrent
    // request created a fresh, still-valid token.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "RefreshToken" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const row = await tx.refreshToken.findUnique({ where: { id: candidate.id }, include: { user: true } });
      if (!row) return { kind: 'invalid' as const };
      if (row.revokedAt || row.expiresAt <= new Date()) {
        await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        return { kind: 'invalid' as const };
      }
      if (row.user.status !== 'ACTIVE') {
        await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        return { kind: 'inactive' as const };
      }
      const now = new Date();
      await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: now } });
      const accessToken = await this.jwt.signAsync({ sub: row.user.id, role: row.user.role });
      const nextRefreshToken = randomBytes(48).toString('base64url');
      await tx.refreshToken.create({
        data: {
          userId: row.user.id, familyId: row.familyId, tokenHash: sha256(nextRefreshToken),
          userAgent: userAgent?.slice(0, 200),
          expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000),
        },
      });
      return { kind: 'ok' as const, tokens: { accessToken, refreshToken: nextRefreshToken, expiresIn: this.config.accessTokenTtlSeconds } };
    });
    if (result.kind === 'inactive') throw new ForbiddenException('Account is not active');
    if (result.kind !== 'ok') throw new UnauthorizedException('Invalid refresh token');
    return { tokens: result.tokens };
  }

  async logout(refreshToken: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  private assertActive(user: Pick<User, 'status'>) {
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');
  }

  private async issueTokens(user: Pick<User, 'id' | 'role'>, familyId: string, userAgent?: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id, familyId, tokenHash: sha256(refreshToken), userAgent: userAgent?.slice(0, 200),
        expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.config.accessTokenTtlSeconds };
  }
}
