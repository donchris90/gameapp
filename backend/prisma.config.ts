import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` (run by npm install) does not connect, so it must work
    // before .env exists. Migrations do connect and fail clearly on this placeholder.
    url: process.env.DATABASE_URL ?? 'postgresql://set-DATABASE_URL-in-env@localhost:5432/unset',
  },
});
