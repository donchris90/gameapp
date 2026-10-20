import { loadConfig } from './config';

const base = () => ({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://playcircle:secret@localhost:5432/playcircle',
  JWT_ACCESS_SECRET: 'a-test-secret-that-is-long-enough-to-pass-validation',
  STORE_MODE: 'fake',
});

describe('loadConfig', () => {
  it('parses exact CORS origins and removes duplicates', () => {
    const cfg = loadConfig({ ...base(), CORS_ORIGINS: 'https://admin.example.com, https://admin.example.com, http://localhost:5173' });
    expect(cfg.corsOrigins).toEqual(['https://admin.example.com', 'http://localhost:5173']);
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() => loadConfig({ ...base(), DATABASE_URL: 'mysql://localhost/db' })).toThrow(/PostgreSQL/);
  });

  it('rejects malformed or path-bearing CORS values', () => {
    expect(() => loadConfig({ ...base(), CORS_ORIGINS: 'https://admin.example.com/dashboard' })).toThrow(/exact origins/);
    expect(() => loadConfig({ ...base(), CORS_ORIGINS: 'not-a-url' })).toThrow(/Invalid CORS origin/);
  });

  it('rejects fake store verification in production', () => {
    expect(() => loadConfig({ ...base(), NODE_ENV: 'production', STORE_MODE: 'fake' })).toThrow(/not allowed in production/);
  });

  it('rejects invalid house fee values', () => {
    expect(() => loadConfig({ ...base(), HOUSE_FEE_PERCENT: 'NaN' })).toThrow(/between 0 and 50/);
    expect(() => loadConfig({ ...base(), HOUSE_FEE_PERCENT: '51' })).toThrow(/between 0 and 50/);
  });
});
