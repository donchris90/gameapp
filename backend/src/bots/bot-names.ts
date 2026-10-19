/** Believable player names for computer opponents. They look like any other username. */
const FIRST = [
  'chidi', 'emeka', 'tunde', 'ada', 'bola', 'kemi', 'sola', 'ife', 'nonso', 'uche', 'femi', 'tobi', 'amaka', 'ngozi', 'yemi', 'seyi',
  'kunle', 'dayo', 'zainab', 'musa', 'ibrahim', 'halima', 'segun', 'obi', 'chika', 'tolu', 'wale', 'bisi', 'jide', 'sade', 'david',
  'grace', 'john', 'mary', 'peter', 'sarah', 'mike', 'jane', 'sam', 'lara', 'kayode', 'ruth', 'daniel', 'esther', 'victor', 'joy',
  'felix', 'ola', 'kelvin', 'precious', 'ebube', 'tari', 'dami', 'ejike', 'ini', 'rita', 'ken', 'lola', 'tayo', 'nkem', 'bayo',
];
const WORD = ['king', 'queen', 'boy', 'girl', 'gamer', 'pro', 'naija', 'lagos', 'abuja', 'vibes', 'legend', 'smart', 'swift', 'lucky', 'cool', 'sharp', 'ace', 'fire', 'star', 'wise'];

const pick = <T,>(a: readonly T[], r: () => number) => a[Math.floor(r() * a.length)];
const letter = (r: () => number) => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(r() * 26)];
const num = (r: () => number) => String(Math.floor(r() * 99) + 1).padStart(r() < 0.3 ? 2 : 1, '0');
const year = (r: () => number) => String(85 + Math.floor(r() * 20)).replace(/^1/, '0');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Returns { username, displayName }. `r` is a random source in [0,1) so tests can make it repeatable. */
export function randomPlayerName(r: () => number = Math.random): { username: string; displayName: string } {
  const f = pick(FIRST, r);
  const styles: Array<() => string> = [
    () => `${f}${num(r)}`,
    () => `${f}_${letter(r)}`,
    () => `${f}${year(r)}`,
    () => `${f}${pick(WORD, r)}`,
    () => `${pick(WORD, r)}_${f}`,
    () => `${f}.${letter(r)}${num(r)}`,
    () => `${cap(f)}${cap(pick(WORD, r))}`,
    () => `${f}_${num(r)}`,
  ];
  const username = styles[Math.floor(r() * styles.length)]().slice(0, 20);
  const displayName = r() < 0.5 ? cap(username.replace(/[_.]/g, ' ').trim().split(' ')[0]) + (/\d+$/.test(username) ? username.match(/\d+$/)![0] : '') : username;
  return { username, displayName: displayName.slice(0, 24) };
}
