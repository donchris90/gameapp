import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { appError } from '../common/errors';
import { FriendsService } from '../friends/friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushService } from '../push/push.service';
import { RoomsService } from '../rooms/rooms.service';
import { Emote } from './emotes';
import { VoiceService, dmChannel } from './voice.service';

const EMOTE_GAP_MS = 1200;
const CALL_RING_MS = 30_000;
export type Period = 'week' | 'all';
export const GAMES = ['TICTACTOE', 'WATER_SORT', 'AYO', 'LUDO', 'APEX', 'WHOT'] as const;

interface Call { id: string; from: string; to: string; channel: string; at: number; answered: boolean }

@Injectable()
export class SocialService {
  private readonly lastEmote = new Map<string, number>();
  private readonly calls = new Map<string, Call>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeService,
    private readonly presence: PresenceService,
    private readonly push: PushService,
    private readonly voice: VoiceService,
  ) {}

  // ---- profiles ----

  async profile(meId: string, userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, equippedFrame: true, equippedTitle: true, createdAt: true, isBot: true, status: true },
    });
    if (!u || u.isBot || u.status !== 'ACTIVE' || (meId !== u.id && (await this.friends.isBlocked(meId, u.id)))) throw appError(404, 'PLAYER_NOT_FOUND', 'No player found');
    const stats = await this.prisma.$queryRaw<Array<{ game: string; played: number; won: number; lost: number; drawn: number }>>(Prisma.sql`
      SELECT m."game"::text AS game, COUNT(*)::int AS played,
             COUNT(*) FILTER (WHERE mp."result" = 'WON')::int AS won,
             COUNT(*) FILTER (WHERE mp."result" = 'LOST')::int AS lost,
             COUNT(*) FILTER (WHERE mp."result" = 'DRAW')::int AS drawn
      FROM "MatchPlayer" mp JOIN "Match" m ON m."id" = mp."matchId"
      WHERE mp."userId" = ${u.id} AND m."status" = 'FINISHED'
      GROUP BY m."game"`);
    const games = GAMES.map((g) => stats.find((s) => s.game === g) ?? { game: g, played: 0, won: 0, lost: 0, drawn: 0 });
    const competitive = games.filter((g) => g.game !== 'WATER_SORT');
    const played = competitive.reduce((n, g) => n + g.played, 0);
    const won = competitive.reduce((n, g) => n + g.won, 0);
    const level = await this.prisma.$queryRaw<Array<{ level: number | null }>>(Prisma.sql`
      SELECT MAX((m."state"->>'level')::int) AS level FROM "MatchPlayer" mp JOIN "Match" m ON m."id" = mp."matchId"
      WHERE mp."userId" = ${u.id} AND m."game" = 'WATER_SORT' AND mp."result" = 'WON'`);
    const relation = meId === u.id ? 'self' : (await this.friends.areFriends(meId, u.id)) ? 'friend' : (await this.pendingWith(meId, u.id));
    return {
      id: u.id, username: u.username, displayName: u.displayName, frame: u.equippedFrame, title: u.equippedTitle,
      joined: u.createdAt, online: this.presence.isOnline(u.id), relation,
      totals: { played, won, winRate: played ? Math.round((won / played) * 100) : 0 },
      waterSortLevel: level[0]?.level ?? 0,
      games,
    };
  }

  private async pendingWith(a: string, b: string): Promise<'none' | 'sent' | 'received'> {
    const row = await this.prisma.friendship.findFirst({ where: { status: 'PENDING', OR: [{ userAId: a, userBId: b }, { userAId: b, userBId: a }] }, select: { requestedById: true } });
    return !row ? 'none' : row.requestedById === a ? 'sent' : 'received';
  }

  // ---- leaderboard ----

  /**
   * Most wins first. Only games with at least one other real player count (so beating the computer cannot climb the board),
   * except Water Sort, which is played alone and counts solved levels when asked for by name.
   */
  async leaderboard(meId: string, period: Period, game?: string) {
    const since = period === 'week' ? new Date(Date.now() - 7 * 86_400_000) : new Date(0);
    const gameSql = game ? Prisma.sql`m."game" = ${game}::"GameType"` : Prisma.sql`m."game" <> 'WATER_SORT'`;
    const rows = await this.prisma.$queryRaw<Array<{ id: string; username: string; displayName: string; frame: string | null; title: string | null; wins: number; rank: number }>>(Prisma.sql`
      WITH board AS (
        SELECT u."id", u."username", u."displayName", u."equippedFrame" AS frame, u."equippedTitle" AS title, COUNT(*)::int AS wins
        FROM "MatchPlayer" mp
        JOIN "Match" m ON m."id" = mp."matchId"
        JOIN "User" u ON u."id" = mp."userId"
        WHERE mp."result" = 'WON' AND m."status" = 'FINISHED' AND m."finishedAt" >= ${since}
          AND u."isBot" = false AND u."status" = 'ACTIVE' AND ${gameSql}
          AND (m."game" = 'WATER_SORT' OR EXISTS (
            SELECT 1 FROM "MatchPlayer" o JOIN "User" ou ON ou."id" = o."userId"
            WHERE o."matchId" = m."id" AND o."userId" <> mp."userId" AND ou."isBot" = false))
        GROUP BY u."id"
      )
      SELECT *, (RANK() OVER (ORDER BY wins DESC))::int AS rank FROM board ORDER BY wins DESC, "displayName" ASC`);
    const top = rows.slice(0, 25).map((r) => ({ userId: r.id, username: r.username, displayName: r.displayName, frame: r.frame, title: r.title, wins: r.wins, rank: r.rank }));
    const mine = rows.find((r) => r.id === meId);
    return { period, game: game ?? null, top, me: mine ? { rank: mine.rank, wins: mine.wins } : { rank: null, wins: 0 }, players: rows.length };
  }

  // ---- reactions during a game ----

  async emote(userId: string, matchId: string, emote: Emote) {
    const now = Date.now();
    if (now - (this.lastEmote.get(userId) ?? 0) < EMOTE_GAP_MS) return { ok: false, error: 'RATE_LIMITED' };
    const m = await this.prisma.match.findUnique({
      where: { id: matchId }, select: { status: true, players: { select: { userId: true, leftAt: true, user: { select: { displayName: true, isBot: true } } } } },
    });
    const me = m?.players.find((p) => p.userId === userId);
    if (!m || !me) return { ok: false, error: 'NOT_IN_MATCH' };
    this.lastEmote.set(userId, now);
    if (this.lastEmote.size > 5000) for (const [k, t] of this.lastEmote) if (now - t > 60_000) this.lastEmote.delete(k);
    for (const p of m.players) {
      if (p.userId === userId || p.user.isBot || p.leftAt) continue;
      if (await this.friends.isBlocked(userId, p.userId)) continue; // a blocked player's reactions never arrive
      this.realtime.emitToUser(p.userId, 'match:emote', { matchId, from: { id: userId, displayName: me.user.displayName }, emote, at: new Date(now).toISOString() });
    }
    return { ok: true };
  }

  // ---- rematch ----

  /** Everyone is already back in the room's lobby after a game with real players: tell the others and get ready. */
  async rematch(userId: string, matchId: string) {
    const m = await this.prisma.match.findUnique({ where: { id: matchId }, select: { game: true, stake: true, status: true, roomId: true, players: { select: { userId: true, user: { select: { displayName: true, isBot: true } } } } } });
    const me = m?.players.find((p) => p.userId === userId);
    if (!m || !me) throw appError(404, 'MATCH_NOT_FOUND', 'Match not found');
    if (m.status !== 'FINISHED') throw appError(409, 'MATCH_NOT_FINISHED', 'The game is still going');
    if (m.players.some((p) => p.user.isBot)) throw appError(409, 'VS_COMPUTER', 'Search for a new game instead');
    const roomId = await this.rooms.currentRoomId(userId);
    if (!m.roomId || roomId !== m.roomId) throw appError(409, 'ROOM_GONE', 'The room is closed. Create a new one or search again');
    const room = await this.rooms.setReady(userId, true);
    for (const p of m.players) {
      if (p.userId === userId) continue;
      this.realtime.emitToUser(p.userId, 'match:rematch', { matchId, from: { id: userId, displayName: me.user.displayName } });
      if (!this.presence.isOnline(p.userId)) void this.push.notify(p.userId, { title: 'Rematch?', body: `${me.user.displayName} wants to play again`, data: { type: 'rematch' } });
    }
    return room;
  }

  // ---- voice ----

  /** Voice for people sharing a room or a game. The channel name is fixed by the server, so nobody can listen in elsewhere. */
  async roomVoice(userId: string) {
    const roomId = await this.rooms.currentRoomId(userId);
    if (!roomId) throw appError(404, 'NOT_IN_ROOM', 'You are not in a room');
    return this.voice.tokenFor(`room-${roomId}`, userId);
  }

  /** Starts a voice call to a friend who is online: rings them over the socket. */
  async startCall(fromId: string, toId: string) {
    if (!this.voice.configured) throw appError(503, 'VOICE_NOT_CONFIGURED', 'Voice calls are not switched on yet');
    if (fromId === toId) throw appError(400, 'SELF', 'You cannot call yourself');
    if (!(await this.friends.areFriends(fromId, toId)) || (await this.friends.isBlocked(fromId, toId))) throw appError(403, 'NOT_FRIENDS', 'You can only call your friends');
    if (!this.presence.isOnline(toId)) throw appError(409, 'OFFLINE', 'They are not online');
    this.sweepCalls();
    for (const c of this.calls.values()) if (c.from === fromId || c.to === fromId || c.to === toId || c.from === toId) throw appError(409, 'BUSY', 'One of you is already in a call');
    const from = await this.prisma.user.findUniqueOrThrow({ where: { id: fromId }, select: { id: true, displayName: true, username: true } });
    const call: Call = { id: randomUUID(), from: fromId, to: toId, channel: dmChannel(fromId, toId), at: Date.now(), answered: false };
    this.calls.set(call.id, call);
    this.realtime.emitToUser(toId, 'call:incoming', { callId: call.id, from, ringMs: CALL_RING_MS });
    return { callId: call.id, ...this.voice.tokenFor(call.channel, fromId) };
  }

  async answerCall(userId: string, callId: string, accept: boolean) {
    const c = this.calls.get(callId);
    if (!c || c.to !== userId || Date.now() - c.at > CALL_RING_MS) { this.calls.delete(callId); throw appError(404, 'CALL_ENDED', 'That call has ended'); }
    if (!accept) {
      this.calls.delete(callId);
      this.realtime.emitToUser(c.from, 'call:declined', { callId });
      return { ok: true };
    }
    c.answered = true;
    this.realtime.emitToUser(c.from, 'call:answered', { callId });
    return { callId, ...this.voice.tokenFor(c.channel, userId) };
  }

  /** Either side hanging up (or the caller giving up while it rings) ends the call for both. */
  endCall(userId: string, callId: string) {
    const c = this.calls.get(callId);
    if (!c || (c.from !== userId && c.to !== userId)) return { ok: true };
    this.calls.delete(callId);
    this.realtime.emitToUser(c.from === userId ? c.to : c.from, 'call:ended', { callId });
    return { ok: true };
  }

  private sweepCalls() {
    const now = Date.now();
    for (const [id, c] of this.calls) if (!c.answered && now - c.at > CALL_RING_MS + 5000) this.calls.delete(id);
    for (const [id, c] of this.calls) if (now - c.at > 3 * 3600_000) this.calls.delete(id);
  }

  /** A player who disconnects drops out of any call. */
  dropCalls(userId: string) {
    for (const [id, c] of this.calls) if (c.from === userId || c.to === userId) this.endCall(userId, id);
  }
}
