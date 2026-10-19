import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

/** Wipes the test database and applies every migration in order. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5433/playcircle_test';
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to wipe "${url}": the database name must contain "test"`);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = join(__dirname, '..', 'prisma', 'migrations');
    for (const name of readdirSync(dir).filter((n) => /^\d+_/.test(n)).sort()) {
      await client.query(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}
