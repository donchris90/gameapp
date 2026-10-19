import { randomInt } from 'crypto';

/** No 0/O/1/I so codes survive being read aloud or typed from a screenshot. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
