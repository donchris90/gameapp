import {
  ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AppConfig, CONFIG } from '../config/config';
import { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { randomCode } from '../common/codes';
import { ageInYears, parseBirthDate } from './age';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wallet: WalletService,
    @Inject(CONFIG) private readonly config: AppConfig,
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

  async refresh(refreshToken: string, userAgent?: string) {
    const hash = sha256(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
    if (!row) throw new UnauthorizedException('Invalid refresh token');

    // Atomically claim the token. If it was already used, someone is replaying
    // it, so every token in the family is revoked and the user signs in again.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Invalid refresh token');
    }
    this.assertActive(row.user);
    return { tokens: await this.issueTokens(row.user, row.familyId, userAgent) };
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
