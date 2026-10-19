import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { appError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeService } from '../realtime/realtime.service';

export const MAX_FRIENDS = 200;
export const MAX_PENDING_OUTGOING = 50;

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
const summaryOf = (u: { id: string; username: string; displayName: string }) => ({ id: u.id, username: u.username, displayName: u.displayName });
const SUMMARY = { id: true, username: true, displayName: true } as const;

export interface FriendTarget {
  username?: string;
  friendCode?: string;
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly presence: PresenceService,
  ) {}

  /** Is there a block in either direction between two players? */
  async isBlocked(a: string, b: string): Promise<boolean> {
    const hit = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
      select: { blockerId: true },
    });
    return !!hit;
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    const [x, y] = pair(a, b);
    const row = await this.prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: x, userBId: y } } });
    return row?.status === 'ACCEPTED';
  }

  private async resolveTarget(meId: string, t: FriendTarget) {
    if (!!t.username === !!t.friendCode) throw appError(400, 'BAD_TARGET', 'Provide either a username or a friend code');
    const target = t.friendCode
      ? await this.prisma.user.findUnique({ where: { friendCode: t.friendCode.trim().toUpperCase() } })
      : await this.prisma.user.findUnique({ where: { usernameLower: t.username!.trim().toLowerCase() } });
    if (target?.id === meId) throw appError(400, 'SELF', 'You cannot add yourself');
    // Same answer for "does not exist", "inactive" and "blocked you", so blocking can't be detected.
    if (!target || target.isBot || target.status !== 'ACTIVE' || (await this.isBlocked(meId, target.id))) throw appError(404, 'PLAYER_NOT_FOUND', 'No player found');
    return target;
  }

  async sendRequest(meId: string, t: FriendTarget, attempt = 0): Promise<{ id: string; status: 'PENDING' | 'ACCEPTED'; user: ReturnType<typeof summaryOf> }> {
    const target = await this.resolveTarget(meId, t);
    const [a, b] = pair(meId, target.id);

    const [pending, friends] = await Promise.all([
      this.prisma.friendship.count({ where: { requestedById: meId, status: 'PENDING' } }),
      this.prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ userAId: meId }, { userBId: meId }] } }),
    ]);
    if (friends >= MAX_FRIENDS) throw appError(409, 'FRIEND_LIMIT', `You can have up to ${MAX_FRIENDS} friends`);

    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: meId }, select: SUMMARY });
    try {
      const existing = await this.prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
      if (existing) {
        if (existing.status === 'ACCEPTED') throw appError(409, 'ALREADY_FRIENDS', 'You are already friends');
        if (existing.requestedById === meId) throw appError(409, 'REQUEST_ALREADY_SENT', 'Friend request already sent');
        // They already asked us: asking back means yes.
        await this.prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
        this.realtime.emitToUser(target.id, 'friend:accepted', { friend: me });
        return { id: existing.id, status: 'ACCEPTED', user: summaryOf(target) };
      }
      if (pending >= MAX_PENDING_OUTGOING) throw appError(409, 'TOO_MANY_PENDING', 'Too many pending friend requests');
      const row = await this.prisma.friendship.create({ data: { userAId: a, userBId: b, requestedById: meId } });
      this.realtime.emitToUser(target.id, 'friend:request', { id: row.id, from: me });
      return { id: row.id, status: 'PENDING', user: summaryOf(target) };
    } catch (e) {
      // Both players sent a request at the same instant: the loser retries and becomes an accept.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) return this.sendRequest(meId, t, attempt + 1);
      throw e;
    }
  }

  async accept(meId: string, requestId: string) {
    const row = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!row || row.status !== 'PENDING' || row.requestedById === meId || (row.userAId !== meId && row.userBId !== meId)) {
      throw appError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
    }
    const claimed = await this.prisma.friendship.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    if (claimed.count !== 1) throw appError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: meId }, select: SUMMARY });
    this.realtime.emitToUser(row.requestedById, 'friend:accepted', { friend: me });
    return { ok: true };
  }

  /** The sender cancels, or the receiver declines. The sender is not told about a decline. */
  async removeRequest(meId: string, requestId: string) {
    const row = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!row || row.status !== 'PENDING' || (row.userAId !== meId && row.userBId !== meId)) {
      throw appError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
    }
    await this.prisma.friendship.deleteMany({ where: { id: row.id, status: 'PENDING' } });
    return { ok: true };
  }

  async removeFriend(meId: string, otherId: string) {
    const [a, b] = pair(meId, otherId);
    const res = await this.prisma.friendship.deleteMany({ where: { userAId: a, userBId: b, status: 'ACCEPTED' } });
    if (res.count !== 1) throw appError(404, 'NOT_FRIENDS', 'You are not friends with this player');
    return { ok: true };
  }

  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    return rows.map((r) => (r.userAId === userId ? r.userBId : r.userAId));
  }

  async list(meId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userAId: meId }, { userBId: meId }] },
      include: { userA: { select: SUMMARY }, userB: { select: SUMMARY } },
      orderBy: { respondedAt: 'desc' },
    });
    return rows
      .map((r) => (r.userAId === meId ? r.userB : r.userA))
      .map((u) => ({ ...u, online: this.presence.isOnline(u.id) }))
      .sort((x, y) => Number(y.online) - Number(x.online) || x.displayName.localeCompare(y.displayName));
  }

  async requests(meId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'PENDING', OR: [{ userAId: meId }, { userBId: meId }] },
      include: { userA: { select: SUMMARY }, userB: { select: SUMMARY } },
      orderBy: { createdAt: 'desc' },
    });
    const shape = (r: (typeof rows)[number]) => ({ id: r.id, createdAt: r.createdAt, user: r.userAId === meId ? r.userB : r.userA });
    return {
      incoming: rows.filter((r) => r.requestedById !== meId).map(shape),
      outgoing: rows.filter((r) => r.requestedById === meId).map(shape),
    };
  }

  async search(meId: string, q: string) {
    const needle = q.trim().toLowerCase();
    if (needle.length < 3) throw appError(400, 'QUERY_TOO_SHORT', 'Type at least 3 characters');
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: meId }, { blockedId: meId }] },
      select: { blockerId: true, blockedId: true },
    });
    const hidden = new Set<string>([meId, ...blocks.flatMap((b) => [b.blockerId, b.blockedId])]);
    const rows = await this.prisma.user.findMany({
      where: { usernameLower: { startsWith: needle }, status: 'ACTIVE', isBot: false, id: { notIn: [...hidden] } },
      select: SUMMARY, orderBy: { usernameLower: 'asc' }, take: 10,
    });
    return rows;
  }

  async block(meId: string, otherId: string) {
    if (meId === otherId) throw appError(400, 'SELF', 'You cannot block yourself');
    const other = await this.prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) throw appError(404, 'PLAYER_NOT_FOUND', 'No player found');
    const [a, b] = pair(meId, otherId);
    await this.prisma.$transaction([
      this.prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: meId, blockedId: otherId } }, update: {}, create: { blockerId: meId, blockedId: otherId } }),
      this.prisma.friendship.deleteMany({ where: { userAId: a, userBId: b } }),
      this.prisma.roomInvite.deleteMany({ where: { OR: [{ fromUserId: meId, toUserId: otherId }, { fromUserId: otherId, toUserId: meId }] } }),
    ]);
    return { ok: true };
  }

  async unblock(meId: string, otherId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId: meId, blockedId: otherId } });
    return { ok: true };
  }

  async blocks(meId: string) {
    const rows = await this.prisma.block.findMany({ where: { blockerId: meId }, include: { blocked: { select: SUMMARY } }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => r.blocked);
  }

  async notifyPresence(userId: string, online: boolean) {
    for (const id of await this.friendIds(userId)) this.realtime.emitToUser(id, online ? 'friend:online' : 'friend:offline', { userId });
  }
}
