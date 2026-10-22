import { createHmac, timingSafeEqual } from 'crypto';

/** A reset code lasts one window, plus the one before it (so about 10 to 20 minutes). */
export const RESET_WINDOW_MS = 10 * 60_000;
export const RESET_MINUTES = 20;

/**
 * A six-digit code worked out from the server secret, the account and its current password hash.
 * Nothing is stored. Changing the password changes the hash, so a used code stops working at once.
 */
export function resetCode(secret: string, userId: string, passwordHash: string, window: number): string {
  const h = createHmac('sha256', secret).update(`reset:${userId}:${passwordHash}:${window}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

export const currentWindow = (now = Date.now()) => Math.floor(now / RESET_WINDOW_MS);

export function checkResetCode(secret: string, userId: string, passwordHash: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const w = currentWindow(now);
  return [w, w - 1].some((x) => {
    const want = Buffer.from(resetCode(secret, userId, passwordHash, x));
    return timingSafeEqual(want, Buffer.from(code));
  });
}
