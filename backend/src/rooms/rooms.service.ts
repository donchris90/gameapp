import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GameType, Prisma } from '../generated/prisma/client';
import { randomCode } from '../common/codes';
import { appError } from '../common/errors';
import { FriendsService } from '../friends/friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeService } from '../realtime/realtime.service';
import { InsufficientCoinsException } from '../wallet/wallet.service';
import { GAME_CONFIG, INVITE_TTL_MS, ROOM_CODE_LENGTH, ROOM_IDLE_MS, STAKE_OPTIONS } from './game-config';

type Tx = Prisma.TransactionClient;

const roomInclude = {
  members: { include: { user: { select: { id: true, username: true, displayName: true } } }, orderBy: { seat: 'asc' as const } },
} satisfies Prisma.RoomInclude;
type RoomFull = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

const isUnique = (e: unknown): e is Prisma.PrismaClientKnownRequestError => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class RoomsService implements OnModuleInit, OnModuleDestroy {
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly presence: PresenceService,
    private readonly friends: FriendsService,
  ) {}

  onModuleInit() {
    this.sweeper = setInterval(() => void this.sweepIdle().catch(() => undefined), 60_000);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  view(room: RoomFull) {
    return {
      id: room.id, code: room.code, game: room.game, kind: room.kind, stake: Number(room.stake),
      minPlayers: room.minPlayers, maxPlayers: room.maxPlayers, status: room.status, hostId: room.hostId,
      members: room.members.map((m) => ({
        userId: m.userId, username: m.user.username, displayName: m.user.displayName,
        seat: m.seat, ready: m.userId === room.hostId ? true : m.ready, online: this.presence.isOnline(m.userId),
      })),
    };
  }

  private lock(tx: Tx, roomId: string) {
    return tx.$queryRaw`SELECT "id" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE`;
  }

  private async balanceOf(tx: Tx, userId: string): Promise<bigint> {
    return (await tx.wallet.findUnique({ where: { userId } }))?.balance ?? 0n;
  }

  private broadcast(room: RoomFull, event = 'room:update') {
    this.realtime.emitToRoom(room.id, event, this.view(room));
  }

  async current(userId: string) {
    const m = await this.prisma.roomMember.findUnique({ where: { userId }, include: { room: { include: roomInclude } } });
    return m ? this.view(m.room) : null;
  }

  async currentRoomId(userId: string): Promise<string | null> {
    return (await this.prisma.roomMember.findUnique({ where: { userId }, select: { roomId: true } }))?.roomId ?? null;
  }

  async create(userId: string, dto: { game: GameType; stake: number; maxPlayers?: number }) {
    const cfg = GAME_CONFIG[dto.game];
    if (!STAKE_OPTIONS.includes(dto.stake)) throw appError(400, 'BAD_STAKE', `Stake must be one of ${STAKE_OPTIONS.join(', ')}`);
    const maxPlayers = dto.maxPlayers ?? cfg.max;
    if (maxPlayers < cfg.min || maxPlayers > cfg.max) throw appError(400, 'BAD_PLAYER_COUNT', `${dto.game} supports ${cfg.min} to ${cfg.max} players`);
    if (await this.currentRoomId(userId)) throw appError(409, 'ALREADY_IN_ROOM', 'Leave your current room first');
    const stake = BigInt(dto.stake);
    if ((await this.balanceOf(this.prisma, userId)) < stake) throw new InsufficientCoinsException();

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const room = await this.prisma.room.create({
          data: {
            code: randomCode(ROOM_CODE_LENGTH), game: dto.game, kind: 'PRIVATE', hostId: userId, stake,
            minPlayers: cfg.min, maxPlayers, members: { create: { userId, seat: 0 } },
          },
          include: roomInclude,
        });
        this.realtime.joinRoomChannel(userId, room.id);
        return this.view(room);
      } catch (e) {
        if (!isUnique(e)) throw e;
        if (await this.currentRoomId(userId)) throw appError(409, 'ALREADY_IN_ROOM', 'Leave your current room first');
        // otherwise the code collided: try another
      }
    }
    throw appError(503, 'TRY_AGAIN', 'Could not create a room, try again');
  }

  async joinByCode(userId: string, code: string) {
    const room = await this.prisma.room.findUnique({ where: { code: code.trim().toUpperCase() }, select: { id: true } });
    if (!room) throw appError(404, 'ROOM_NOT_FOUND', 'No room with that code');
    return this.joinRoom(userId, room.id);
  }

  async joinRoom(userId: string, roomId: string) {
    let updated: RoomFull;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, roomId);
        const room = await tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
        if (!room) throw appError(404, 'ROOM_NOT_FOUND', 'No room with that code');
        if (room.members.some((m) => m.userId === userId)) return room; // already here
        if (room.status !== 'WAITING') throw appError(409, 'ROOM_STARTED', 'That game has already started');
        if (room.members.length >= room.maxPlayers) throw appError(409, 'ROOM_FULL', 'That room is full');

        const ids = room.members.map((m) => m.userId);
        const blocked = await tx.block.findFirst({
          where: { OR: [{ blockerId: userId, blockedId: { in: ids } }, { blockerId: { in: ids }, blockedId: userId }] },
        });
        if (blocked) throw appError(403, 'CANNOT_JOIN', 'You cannot join this room');
        if ((await this.balanceOf(tx, userId)) < room.stake) throw new InsufficientCoinsException();

        const taken = new Set(room.members.map((m) => m.seat));
        let seat = 0;
        while (taken.has(seat)) seat++;
        await tx.roomMember.create({ data: { roomId, userId, seat } });
        await tx.roomInvite.deleteMany({ where: { roomId, toUserId: userId } });
        return tx.room.findUniqueOrThrow({ where: { id: roomId }, include: roomInclude });
      });
    } catch (e) {
      if (isUnique(e)) throw appError(409, 'ALREADY_IN_ROOM', 'Leave your current room first');
      throw e;
    }
    this.realtime.joinRoomChannel(userId, updated.id);
    this.broadcast(updated);
    return this.view(updated);
  }

  /** Removes a player from their room. Used for leaving, kicking and the idle sweeper. */
  private async removeMember(userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const member = await tx.roomMember.findUnique({ where: { userId } });
      if (!member) return null;
      await this.lock(tx, member.roomId);
      const room = await tx.room.findUnique({ where: { id: member.roomId }, include: roomInclude });
      if (!room || !room.members.some((m) => m.userId === userId)) return null;

      await tx.roomMember.delete({ where: { userId } });
      const remaining = room.members.filter((m) => m.userId !== userId);
      if (remaining.length === 0) {
        await tx.room.delete({ where: { id: room.id } });
        return { roomId: room.id, room: null, aborted: false };
      }
      const data: Prisma.RoomUpdateInput = {};
      if (room.hostId === userId) data.host = { connect: { id: remaining[0].userId } };
      let aborted = false;
      if (room.status === 'IN_PROGRESS' && remaining.length < room.minPlayers) {
        // A game cannot continue without enough players. Step 3 refunds stakes from here.
        data.status = 'WAITING';
        data.startedAt = null;
        await tx.roomMember.updateMany({ where: { roomId: room.id }, data: { ready: false } });
        aborted = true;
      }
      if (Object.keys(data).length) await tx.room.update({ where: { id: room.id }, data });
      return { roomId: room.id, room: await tx.room.findUniqueOrThrow({ where: { id: room.id }, include: roomInclude }), aborted };
    });
    if (!result) return null;
    this.realtime.leaveRoomChannel(userId, result.roomId);
    if (result.room) {
      this.broadcast(result.room);
      if (result.aborted) this.broadcast(result.room, 'room:aborted');
    }
    return result;
  }

  async leave(userId: string) {
    const res = await this.removeMember(userId);
    if (!res) throw appError(404, 'NOT_IN_ROOM', 'You are not in a room');
    return { ok: true };
  }

  async kick(hostId: string, targetId: string) {
    const roomId = await this.currentRoomId(hostId);
    const room = roomId ? await this.prisma.room.findUnique({ where: { id: roomId } }) : null;
    if (!room) throw appError(404, 'NOT_IN_ROOM', 'You are not in a room');
    if (room.hostId !== hostId) throw appError(403, 'NOT_HOST', 'Only the host can do that');
    if (targetId === hostId) throw appError(400, 'SELF', 'You cannot remove yourself, leave instead');
    if (room.status !== 'WAITING') throw appError(409, 'ROOM_STARTED', 'The game has already started');
    const target = await this.prisma.roomMember.findFirst({ where: { roomId: room.id, userId: targetId } });
    if (!target) throw appError(404, 'NOT_A_MEMBER', 'That player is not in your room');
    await this.removeMember(targetId);
    this.realtime.emitToUser(targetId, 'room:kicked', { roomId: room.id });
    return { ok: true };
  }

  async setReady(userId: string, ready: boolean) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const member = await tx.roomMember.findUnique({ where: { userId } });
      if (!member) throw appError(404, 'NOT_IN_ROOM', 'You are not in a room');
      await this.lock(tx, member.roomId);
      const room = await tx.room.findUniqueOrThrow({ where: { id: member.roomId } });
      if (room.status !== 'WAITING') throw appError(409, 'ROOM_STARTED', 'The game has already started');
      if (ready && (await this.balanceOf(tx, userId)) < room.stake) throw new InsufficientCoinsException();
      await tx.roomMember.update({ where: { userId }, data: { ready } });
      return tx.room.findUniqueOrThrow({ where: { id: room.id }, include: roomInclude });
    });
    this.broadcast(updated);
    return this.view(updated);
  }

  async start(hostId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const member = await tx.roomMember.findUnique({ where: { userId: hostId } });
      if (!member) throw appError(404, 'NOT_IN_ROOM', 'You are not in a room');
      await this.lock(tx, member.roomId);
      const room = await tx.room.findUniqueOrThrow({ where: { id: member.roomId }, include: roomInclude });
      if (room.hostId !== hostId) throw appError(403, 'NOT_HOST', 'Only the host can start the game');
      if (room.status !== 'WAITING') throw appError(409, 'ROOM_STARTED', 'The game has already started');
      if (room.members.length < room.minPlayers) throw appError(409, 'NOT_ENOUGH_PLAYERS', `Need at least ${room.minPlayers} players`);
      if (room.members.some((m) => m.userId !== hostId && !m.ready)) throw appError(409, 'NOT_ALL_READY', 'Everyone must be ready');

      const wallets = await tx.wallet.findMany({ where: { userId: { in: room.members.map((m) => m.userId) } } });
      const balance = new Map(wallets.map((w) => [w.userId, w.balance]));
      const broke = room.members.filter((m) => (balance.get(m.userId) ?? 0n) < room.stake);
      if (broke.length) {
        throw appError(409, 'CANNOT_AFFORD', 'Some players do not have enough coins for this stake', {
          players: broke.map((m) => ({ userId: m.userId, displayName: m.user.displayName })),
        });
      }
      await tx.room.update({ where: { id: room.id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
      return tx.room.findUniqueOrThrow({ where: { id: room.id }, include: roomInclude });
    });
    this.broadcast(updated, 'room:started');
    return this.view(updated);
  }

  /** Called by the game engines when a game ends: back to the lobby so friends can rematch. */
  async finishGame(roomId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, roomId);
      await tx.roomMember.updateMany({ where: { roomId }, data: { ready: false } });
      await tx.room.update({ where: { id: roomId }, data: { status: 'WAITING', startedAt: null } });
      return tx.room.findUniqueOrThrow({ where: { id: roomId }, include: roomInclude });
    });
    this.broadcast(updated);
    return this.view(updated);
  }

  // ---- invites ----

  async invite(fromId: string, toId: string) {
    const roomId = await this.currentRoomId(fromId);
    const room = roomId ? await this.prisma.room.findUnique({ where: { id: roomId }, include: roomInclude }) : null;
    if (!room) throw appError(404, 'NOT_IN_ROOM', 'You are not in a room');
    if (room.status !== 'WAITING') throw appError(409, 'ROOM_STARTED', 'The game has already started');
    if (room.members.length >= room.maxPlayers) throw appError(409, 'ROOM_FULL', 'That room is full');
    if (!(await this.friends.areFriends(fromId, toId)) || (await this.friends.isBlocked(fromId, toId))) {
      throw appError(403, 'NOT_FRIENDS', 'You can only invite your friends');
    }
    if (room.members.some((m) => m.userId === toId)) throw appError(409, 'ALREADY_IN_ROOM', 'They are already in this room');
    if ((await this.prisma.roomInvite.count({ where: { roomId: room.id, expiresAt: { gt: new Date() } } })) >= 20) {
      throw appError(409, 'TOO_MANY_INVITES', 'Too many pending invites');
    }
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invite = await this.prisma.roomInvite.upsert({
      where: { roomId_toUserId: { roomId: room.id, toUserId: toId } },
      update: { fromUserId: fromId, expiresAt, createdAt: new Date() },
      create: { roomId: room.id, fromUserId: fromId, toUserId: toId, expiresAt },
    });
    const from = room.members.find((m) => m.userId === fromId)!.user;
    this.realtime.emitToUser(toId, 'room:invite', {
      id: invite.id, from, expiresAt, room: { code: room.code, game: room.game, stake: Number(room.stake) },
    });
    return { id: invite.id, expiresAt };
  }

  async listInvites(userId: string) {
    const rows = await this.prisma.roomInvite.findMany({
      where: { toUserId: userId, expiresAt: { gt: new Date() } },
      include: { from: { select: { id: true, username: true, displayName: true } }, room: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id, expiresAt: r.expiresAt, from: r.from, room: { code: r.room.code, game: r.room.game, stake: Number(r.room.stake) },
    }));
  }

  async acceptInvite(userId: string, inviteId: string) {
    const invite = await this.prisma.roomInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.toUserId !== userId || invite.expiresAt <= new Date()) throw appError(404, 'INVITE_NOT_FOUND', 'Invite not found or expired');
    return this.joinRoom(userId, invite.roomId);
  }

  async declineInvite(userId: string, inviteId: string) {
    const res = await this.prisma.roomInvite.deleteMany({ where: { id: inviteId, toUserId: userId } });
    if (res.count !== 1) throw appError(404, 'INVITE_NOT_FOUND', 'Invite not found or expired');
    return { ok: true };
  }

  // ---- quick match ----

  /**
   * Builds a started room for players the matchmaker paired. Anyone who is now in
   * another room or cannot afford the stake is dropped. Returns null if too few remain.
   */
  async createQuickRoom(game: GameType, stake: bigint, userIds: string[], size: number) {
    const cfg = GAME_CONFIG[game];
    const dropped: Array<{ userId: string; reason: 'IN_ROOM' | 'CANNOT_AFFORD' }> = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const inRooms = new Set((await tx.roomMember.findMany({ where: { userId: { in: userIds } }, select: { userId: true } })).map((m) => m.userId));
      const wallets = new Map((await tx.wallet.findMany({ where: { userId: { in: userIds } } })).map((w) => [w.userId, w.balance]));
      const ok: string[] = [];
      for (const id of userIds) {
        if (inRooms.has(id)) dropped.push({ userId: id, reason: 'IN_ROOM' });
        else if ((wallets.get(id) ?? 0n) < stake) dropped.push({ userId: id, reason: 'CANNOT_AFFORD' });
        else ok.push(id);
      }
      if (ok.length < size) return null;
      const room = await tx.room.create({
        data: {
          code: randomCode(ROOM_CODE_LENGTH), game, kind: 'QUICK', hostId: ok[0], stake, minPlayers: cfg.min, maxPlayers: size,
          status: 'IN_PROGRESS', startedAt: new Date(),
          members: { create: ok.map((userId, seat) => ({ userId, seat, ready: true })) },
        },
        include: roomInclude,
      });
      return room;
    });
    if (result) {
      for (const m of result.members) this.realtime.joinRoomChannel(m.userId, result.id);
    }
    return { room: result ? this.view(result) : null, dropped };
  }

  // ---- housekeeping ----

  /** Removes players who went offline long ago from lobbies that are not mid-game. */
  async sweepIdle(now = Date.now()) {
    const members = await this.prisma.roomMember.findMany({ where: { room: { status: 'WAITING' } }, select: { userId: true } });
    let removed = 0;
    for (const m of members) {
      if (this.presence.offlineFor(m.userId, now) > ROOM_IDLE_MS && (await this.removeMember(m.userId))) removed++;
    }
    return removed;
  }

  /** Tells the room a member's online dot changed. */
  async notifyPresence(userId: string) {
    const m = await this.prisma.roomMember.findUnique({ where: { userId }, include: { room: { include: roomInclude } } });
    if (m) this.broadcast(m.room);
  }
}
