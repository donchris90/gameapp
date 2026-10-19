/**
 * Gives an existing account the admin role (or takes it away with --remove).
 *   npm run make-admin -- someone@example.com
 *   npm run make-admin -- someone@example.com --remove
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email || !process.env.DATABASE_URL) {
    console.error('Usage: DATABASE_URL=... npm run make-admin -- <email> [--remove]');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const role = flag === '--remove' ? 'USER' : 'ADMIN';
    const r = await prisma.user.updateMany({ where: { email: email.trim().toLowerCase() }, data: { role } });
    if (r.count === 0) { console.error(`No account with email ${email}`); process.exit(1); }
    console.log(`${email} is now ${role}`);
  } finally {
    await prisma.$disconnect();
  }
}
void main();
