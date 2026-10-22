import { RESET_WINDOW_MS, checkResetCode, currentWindow, resetCode } from './reset-code';

describe('reset code', () => {
  const secret = 'test-secret';
  const now = 1_800_000_000_000;

  it('is six digits and the same for the same account and window', () => {
    const a = resetCode(secret, 'u1', 'hash1', currentWindow(now));
    expect(a).toMatch(/^\d{6}$/);
    expect(resetCode(secret, 'u1', 'hash1', currentWindow(now))).toBe(a);
    expect(resetCode(secret, 'u2', 'hash1', currentWindow(now))).not.toBe(a);
  });

  it('works now and in the next window, then expires', () => {
    const code = resetCode(secret, 'u1', 'hash1', currentWindow(now));
    expect(checkResetCode(secret, 'u1', 'hash1', code, now)).toBe(true);
    expect(checkResetCode(secret, 'u1', 'hash1', code, now + RESET_WINDOW_MS)).toBe(true);
    expect(checkResetCode(secret, 'u1', 'hash1', code, now + 2 * RESET_WINDOW_MS)).toBe(false);
  });

  it('stops working once the password has changed, and rejects wrong or malformed codes', () => {
    const code = resetCode(secret, 'u1', 'hash1', currentWindow(now));
    expect(checkResetCode(secret, 'u1', 'hash2', code, now)).toBe(false);
    expect(checkResetCode(secret, 'u1', 'hash1', '000000' === code ? '111111' : '000000', now)).toBe(false);
    expect(checkResetCode(secret, 'u1', 'hash1', '12345', now)).toBe(false);
    expect(checkResetCode(secret, 'u1', 'hash1', 'abcdef', now)).toBe(false);
  });
});
