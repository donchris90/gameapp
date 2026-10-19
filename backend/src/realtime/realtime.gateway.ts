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
 * From the client: room:chat, match:emote.
 */
@WebSocketGateway({ cors: { origin: true } })
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
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
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
