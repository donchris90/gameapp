const FIRST = ['Chidi', 'Tunde', 'Amaka', 'Ife', 'Emeka', 'Zainab', 'Femi', 'Ngozi', 'Segun', 'Hauwa', 'Kelechi', 'Bisi', 'Obinna', 'Yetunde', 'Musa', 'Chioma', 'Dayo', 'Tolu', 'Ibrahim', 'Ada', 'Nonso', 'Funke', 'Uche', 'Sade', 'Kunle', 'Halima', 'Ikenna', 'Titi', 'Gbenga', 'Nneka', 'Sam', 'Grace', 'Daniel', 'Blessing', 'David', 'Peace', 'Michael', 'Joy', 'Victor', 'Esther'];
const LAST = ['Okafor', 'Adeyemi', 'Bello', 'Eze', 'Balogun', 'Nwosu', 'Ogunleye', 'Danjuma', 'Ibe', 'Afolabi', 'Okonkwo', 'Salami', 'Chukwu', 'Abubakar', 'Okoye', 'Adebayo', 'Lawal', 'Obi', 'Yusuf', 'Ojo', 'Nnamdi', 'Fashola', 'Umeh', 'Akande', 'Williams', 'Johnson', 'Brown', 'Mensah'];

/** A normal-looking player name for a computer driver. `n` is a random number from 0 to 1. */
export function randomName(next: () => number): string {
  const f = FIRST[Math.floor(next() * FIRST.length)], l = LAST[Math.floor(next() * LAST.length)];
  const style = next();
  if (style < 0.6) return `${f} ${l}`;
  if (style < 0.8) return `${f}${Math.floor(next() * 90 + 10)}`;
  if (style < 0.9) return `${f}_${l.slice(0, 3)}`;
  return `${f[0]}. ${l}`;
}
