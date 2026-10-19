import { poolOptions } from './prisma.service';

describe('poolOptions', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('leaves the url alone by default', () => {
    delete process.env.DATABASE_SSL;
    expect(poolOptions('postgresql://u:p@h:5432/db?sslmode=require')).toEqual({ connectionString: 'postgresql://u:p@h:5432/db?sslmode=require', max: 10 });
  });

  it('no-verify drops sslmode and accepts the hosted certificate, keeping odd passwords intact', () => {
    process.env.DATABASE_SSL = 'no-verify';
    process.env.DATABASE_POOL_MAX = '5';
    const o = poolOptions('postgresql://postgres.abc:p%40ss%2Fw@aws-0.pooler.supabase.com:5432/postgres?sslmode=require') as any;
    expect(o.max).toBe(5);
    expect(o.ssl).toEqual({ rejectUnauthorized: false });
    expect(o.connectionString).not.toContain('sslmode');
    const u = new URL(o.connectionString);
    expect(decodeURIComponent(u.password)).toBe('p@ss/w');
    expect(u.hostname).toBe('aws-0.pooler.supabase.com');
  });
});
