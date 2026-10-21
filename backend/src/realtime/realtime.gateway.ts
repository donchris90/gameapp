import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { FriendsService } from '../friends/friends.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { PrismaService } from '../prisma/prisma.service';
import { isEmote } from '../social/emotes';
import { SocialService } from '../social/social.service';
import { RoomsService } from '../rooms/rooms.service';
import { PresenceService } from './presence.service';
import { RealtimeService } from './realtime.service';

const CHAT_MAX_LENGTH = 200;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 5_000;

/**
 * Pushes events to players. Commands (create room, ready, start, friend requests)
 * go over REST; the socket carries server events plus in-room chat.
 *
 * Connect with `io(url, { auth: { token: accessToken } })`.
 * Events sent to a player: friend:request, friend:accepted, friend:online, friend:offline,
 * room:update, room:started, room:aborted, room:kicked, room:invite, room:chat,
 * match:found, match:failed, match:timeout, match:emote, match:rematch, call:incoming, call:answered, call:declined, call:ended.
 * From the client: room:chat, match:emote, apex:pos (a driver's live position in an Apex race).
 */
@WebSocketGateway({
  // Never reflect arbitrary browser origins. Native clients generally omit Origin; browser clients must be listed in CORS_ORIGINS.
  cors: { origin: (process.env.CORS_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean) },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('Realtime');
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly realtime: RealtimeService,
    private readonly friends: FriendsService,
    private readonly rooms: RoomsService,
    private readonly matchmaking: MatchmakingService,
    private readonly social: SocialService,
  ) {}

  afterInit(server: Server) {
    this.realtime.server = server;
  }

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128) throw new Error('invalid subject');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, status: true } });
      if (!user || user.status !== 'ACTIVE') throw new Error('inactive');

      socket.data.userId = user.id;
      socket.data.chat = [] as number[];
      await socket.join(`user:${user.id}`);
      const roomId = await this.rooms.currentRoomId(user.id);
      if (roomId) await socket.join(`room:${roomId}`);

      if (this.presence.add(user.id, socket.id)) {
        void this.friends.notifyPresence(user.id, true).catch(() => undefined);
        void this.rooms.notifyPresence(user.id).catch(() => undefined);
      }
      socket.emit('ready', { userId: user.id });
    } catch {
      socket.emit('unauthorized', { message: 'Invalid or expired token' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const userId: string | undefined = socket.data.userId;
    if (!userId) return;
    if (this.presence.remove(userId, socket.id)) {
      this.matchmaking.leave(userId);
      this.social.dropCalls(userId);
      void this.friends.notifyPresence(userId, false).catch(() => undefined);
      void this.rooms.notifyPresence(userId).catch((e) => this.log.warn(e));
    }
  }

  /** A quick reaction during a game: `{ matchId, emote }`. Only ids from the fixed list are accepted. */
  @SubscribeMessage('match:emote')
  async emote(@ConnectedSocket() socket: Socket, @MessageBody() body: { matchId?: unknown; emote?: unknown }) {
    const userId: string | undefined = socket.data.userId;
    if (!userId) return { ok: false, error: 'UNAUTHORIZED' };
    if (typeof body?.matchId !== 'string' || !isEmote(body.emote)) return { ok: false, error: 'BAD_EMOTE' };
    return this.social.emote(userId, body.matchId, body.emote);
  }

  /**
   * Live position of a driver in an Apex race: `{ matchId, z, x, v, tick, fin }`. Passed on to the other drivers
   * of that race so they can see a ghost car. It never decides anything: the result comes from the server
   * re-driving the recorded controls.
   */
  @SubscribeMessage('apex:pos')
  async apexPos(@ConnectedSocket() socket: Socket, @MessageBody() body: { matchId?: unknown; z?: unknown; x?: unknown; v?: unknown; tick?: unknown; fin?: unknown }) {
    const userId: string | undefined = socket.data.userId;
    if (!userId || typeof body?.matchId !== 'string') return { ok: false };
    const now = Date.now();
    if (now - ((socket.data.apexAt as number | undefined) ?? 0) < 40) return { ok: false }; // at most about 25 a second
    socket.data.apexAt = now;
    const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
    const z = num(body.z, -50, 100_000), x = num(body.x, -60, 60), v = num(body.v, 0, 200), tick = num(body.tick, 0, 100_000), fin = num(body.fin, 0, 100_000);
    if (z === null || x === null || v === null || tick === null) return { ok: false };

    let ctx = socket.data.apex as { matchId: string; seat: number; others: string[]; at: number } | undefined;
    if (!ctx || ctx.matchId !== body.matchId || now - ctx.at > 30_000) {
      const rows = await this.prisma.matchPlayer.findMany({
        where: { matchId: body.matchId, match: { status: 'ACTIVE', game: 'APEX' } }, select: { userId: true, seat: true, leftAt: true },
      });
      const me = rows.find((r) => r.userId === userId && !r.leftAt);
      if (!me) return { ok: false };
      ctx = { matchId: body.matchId, seat: me.seat, others: rows.filter((r) => r.userId !== userId && !r.leftAt).map((r) => r.userId), at: now };
      socket.data.apex = ctx;
    }
    for (const id of ctx.others) this.realtime.emitToUser(id, 'apex:pos', { matchId: ctx.matchId, seat: ctx.seat, z, x, v, tick, fin: fin ?? 0 });
    return { ok: true };
  }

  @SubscribeMessage('room:chat')
  async chat(@ConnectedSocket() socket: Socket, @MessageBody() body: { text?: unknown }) {
    const userId: string | undefined = socket.data.userId;
    if (!userId) return { ok: false, error: 'UNAUTHORIZED' };
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, CHAT_MAX_LENGTH) : '';
    if (!text) return { ok: false, error: 'EMPTY' };

    const now = Date.now();
    const recent = (socket.data.chat as number[]).filter((t) => now - t < CHAT_WINDOW_MS);
    if (recent.length >= CHAT_BURST) return { ok: false, error: 'RATE_LIMITED' };
    recent.push(now);
    socket.data.chat = recent;

    const member = await this.prisma.roomMember.findUnique({
      where: { userId }, select: { roomId: true, user: { select: { id: true, displayName: true } } },
    });
    if (!member) return { ok: false, error: 'NOT_IN_ROOM' };
    this.realtime.emitToRoom(member.roomId, 'room:chat', { from: member.user, text, at: new Date(now).toISOString() });
    return { ok: true };
  }
}
