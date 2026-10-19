/** Quick reactions players can send during a game. Fixed list: nothing typed by a player reaches the opponent, so nothing needs moderating. */
export const EMOTES = ['gg', 'wow', 'haha', 'oops', 'fire', 'clap', 'think', 'hurry', 'luck', 'nice', 'rematch', 'cry'] as const;
export type Emote = (typeof EMOTES)[number];
export const isEmote = (v: unknown): v is Emote => typeof v === 'string' && (EMOTES as readonly string[]).includes(v);
