import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { randomCode } from '../common/codes';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Keeps one admin account in step with the ADMIN_EMAIL / ADMIN_PASSWORD settings, so the admin website
 * works right after a deploy without anyone running a script. Safe on every start:
 *  - no such account: it is created (no welcome coins);
 *  - account exists: it is made ADMIN and active, and the password is set to the configured one.
 * Remove the two settings and nothing happens; the account then stays as it is.
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly log = new Logger('AdminSeed');
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService) {}

  async onApplicationBootstrap() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email && !password) return;
    if (!email || !password) return void this.log.warn('Set both ADMIN_EMAIL and ADMIN_PASSWORD; skipping.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return void this.log.warn('ADMIN_EMAIL is not a valid email; skipping.');
    if (password.length < 10) return void this.log.warn('ADMIN_PASSWORD must be at least 10 characters; skipping.');
    try {
      await this.seed(email, password);
    } catch (e) {
      this.log.error(`Could not set up the admin account: ${(e as Error).message}`); // never stop the server for this
    }
  }

  private async seed(email: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      const same = await argon2.verify(existing.passwordHash, password).catch(() => false);
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', status: 'ACTIVE', ...(same ? {} : { passwordHash: await argon2.hash(password) }) } });
        if (!same) await tx.refreshToken.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
      });
      if (existing.role !== 'ADMIN' || !same || existing.status !== 'ACTIVE') this.log.log(`Admin account ${email} updated`);
      return;
    }
    const base = (process.env.ADMIN_USERNAME ?? 'admin').trim() || 'admin';
    const taken = await this.prisma.user.findUnique({ where: { usernameLower: base.toLowerCase() } });
    const username = taken ? `${base}_${randomBytes(2).toString('hex')}` : base;
    const now = new Date();
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email, username, usernameLower: username.toLowerCase(), displayName: username, friendCode: randomCode(8), passwordHash,
          birthDate: new Date('1990-01-01'), ageConfirmedAt: now, termsAcceptedAt: now, role: 'ADMIN',
        },
      });
      await this.wallet.ensureWallet(tx, u.id);
    });
    this.log.log(`Admin account ${email} created`);
  }
}
