export type GameType = 'TICTACTOE' | 'WATER_SORT' | 'AYO' | 'LUDO';
export interface UserSummary { id: string; username: string; displayName: string; }
export interface Me extends UserSummary { email: string; friendCode: string; role: string; createdAt: string; }
export interface ChatMessage { id: string; from: string; to: string; body: string; createdAt: string; readAt: string | null }
export interface Conversation { user: UserSummary & { online: boolean }; last: { id: string; body: string; createdAt: string; mine: boolean }; unread: number }
export interface Tokens { accessToken: string; refreshToken: string; }
export interface RoomMember { userId: string; username: string; displayName: string; frame: string | null; title: string | null; seat: number; ready: boolean; online: boolean; }
export interface Room {
  id: string; code: string; game: GameType; kind: string; stake: number; minPlayers: number; maxPlayers: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'CLOSED'; hostId: string; members: RoomMember[];
}
export interface MatchPlayer { userId: string; username: string; displayName: string; frame: string | null; title: string | null; seat: number; payout: number; result: 'WON' | 'LOST' | 'DRAW' | null; left: boolean; }
export interface Match<S = any> {
  id: string; roomId: string | null; game: GameType; stake: number; pot: number; houseFee: number;
  status: 'ACTIVE' | 'FINISHED'; endReason: string | null; winnerId: string | null; version: number;
  turnSeat: number | null; autoPlay?: string[];
  turnDeadline: string | null; state: S; players: MatchPlayer[];
}
export interface GamesInfo {
  games: Array<{ game: GameType; available: boolean; minPlayers: number; maxPlayers: number }>;
  stakes: number[]; houseFeePercent: number; turnTimeoutSeconds: number;
}
export interface RewardsStatus {
  daily: { available: boolean; streak: number; coins?: number; claimedCoins?: number; nextAt?: string };
  ads: { coinsPerAd: number; dailyCap: number; watchedToday: number; remainingToday: number };
}
export type Activity =
  | { state: 'offline' } | { state: 'online' } | { state: 'playing'; game: GameType }
  | { state: 'lobby'; game: GameType; code: string; stake: number; joinable: boolean };
export interface GameStat { game: GameType; played: number; won: number; lost: number; drawn: number }
export interface PlayerProfile {
  id: string; username: string; displayName: string; frame: string | null; title: string | null; joined: string; online: boolean;
  relation: 'self' | 'friend' | 'none' | 'sent' | 'received';
  totals: { played: number; won: number; winRate: number }; waterSortLevel: number; games: GameStat[];
}
export interface LeaderRow { userId: string; username: string; displayName: string; frame: string | null; title: string | null; wins: number; rank: number }
export interface Leaderboard { period: 'week' | 'all'; game: GameType | null; top: LeaderRow[]; me: { rank: number | null; wins: number }; players: number }
