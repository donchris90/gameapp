import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { appError } from '../common/errors';
import { FriendsService } from '../friends/friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushService } from '../push/push.service';

export const MAX_MESSAGE_LENGTH = 500;
/** Most messages one player may send per minute. */
export const MESSAGES_PER_MINUTE = 20;

const view = (m: { id: string; senderId: string; recipientId: string; body: string; createdAt: Date; readAt: Date | null }) => ({
  id: m.id, from: m.senderId, to: m.recipientId, body: m.body, createdAt: m.createdAt, readAt: m.readAt,
});

/** Private chat between friends. Only accepted, unblocked friends can write to each other. */
@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly realtime: RealtimeService,
    private readonly presence: PresenceService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    // Old messages are removed so the database stays small and old chats do not live forever.
    this.timer = setInterval(() => void this.cleanup().catch(() => undefined), 6 * 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(now = Date.now()) {
    const days = Number(process.env.CHAT_RETENTION_DAYS ?? 30);
    const r = await this.prisma.message.deleteMany({ where: { createdAt: { lt: new Date(now - days * 86_400_000) } } });
    return r.count;
  }

  /** The other player must be an active, unblocked friend. One answer for every reason, so blocking cannot be detected. */
  private async friendOrThrow(meId: string, otherId: string) {
    const other = await this.prisma.user.findUnique({ where: { id: otherId }, select: { id: true, displayName: true, username: true, status: true, isBot: true } });
    if (!other || other.isBot || other.status !== 'ACTIVE' || otherId === meId || !(await this.friends.areFriends(meId, otherId)) || (await this.friends.isBlocked(meId, otherId))) {
      throw appError(403, 'CANNOT_CHAT', 'You can only chat with your friends');
    }
    return other;
  }

  async send(meId: string, otherId: string, raw: string) {
    const other = await this.friendOrThrow(meId, otherId);
    const body = raw.replace(/\r\n?/g, '\n').trim();
    if (body.length === 0) throw appError(400, 'EMPTY_MESSAGE', 'Write something first');
    if (body.length > MAX_MESSAGE_LENGTH) throw appError(400, 'MESSAGE_TOO_LONG', `Messages can be up to ${MAX_MESSAGE_LENGTH} characters`);
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/.test(body)) throw appError(400, 'BAD_CHARACTERS', 'That message has characters we cannot send');
    const recent = await this.prisma.message.count({ where: { senderId: meId, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent >= MESSAGES_PER_MINUTE) throw appError(429, 'SLOW_DOWN', 'You are sending messages too fast');

    const m = await this.prisma.message.create({ data: { senderId: meId, recipientId: otherId, body } });
    const v = view(m);
    this.realtime.emitToUser(otherId, 'chat:message', v);
    this.realtime.emitToUser(meId, 'chat:message', v); // the sender's other devices
    if (!this.presence.isOnline(otherId)) {
      const me = await this.prisma.user.findUniqueOrThrow({ where: { id: meId }, select: { displayName: true } });
      void this.push.notify(otherId, { title: me.displayName, body: body.length > 120 ? `${body.slice(0, 117)}...` : body, data: { type: 'chat', from: meId } });
    }
    void other;
    return v;
  }

  /** Newest first in the database, returned oldest first so the screen can show it as is. */
  async messages(meId: string, otherId: string, opts: { limit: number; before?: string }) {
    await this.friendOrThrow(meId, otherId);
    const rows = await this.prisma.message.findMany({
      where: { OR: [{ senderId: meId, recipientId: otherId }, { senderId: otherId, recipientId: meId }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: opts.limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
    });
    const page = rows.slice(0, opts.limit);
    return { messages: page.reverse().map(view), nextBefore: rows.length > opts.limit ? page[0].id : null };
  }

  async markRead(meId: string, otherId: string) {
    await this.friendOrThrow(meId, otherId);
    const r = await this.prisma.message.updateMany({ where: { senderId: otherId, recipientId: meId, readAt: null }, data: { readAt: new Date() } });
    if (r.count > 0) this.realtime.emitToUser(otherId, 'chat:read', { by: meId });
    return { read: r.count };
  }

  async unreadTotal(meId: string) {
    return { total: await this.prisma.message.count({ where: { recipientId: meId, readAt: null, sender: { status: 'ACTIVE' } } }) };
  }

  /** One row per friend you have talked with: last message and how many you have not read. */
  async conversations(meId: string) {
    const [last, unread, friendIds, blocks] = await Promise.all([
      this.prisma.$queryRaw<Array<{ peer: string; id: string; body: string; createdAt: Date; senderId: string }>>`
        SELECT DISTINCT ON (peer) peer, "id", "body", "createdAt", "senderId" FROM (
          SELECT CASE WHEN "senderId" = ${meId} THEN "recipientId" ELSE "senderId" END AS peer, "id", "body", "createdAt", "senderId"
          FROM "Message" WHERE "senderId" = ${meId} OR "recipientId" = ${meId}) t
        ORDER BY peer, "createdAt" DESC, "id" DESC`,
      this.prisma.message.groupBy({ by: ['senderId'], where: { recipientId: meId, readAt: null }, _count: true }),
      this.friends.friendIds(meId),
      this.prisma.block.findMany({ where: { OR: [{ blockerId: meId }, { blockedId: meId }] }, select: { blockerId: true, blockedId: true } }),
    ]);
    const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
    const visible = last.filter((l) => friendIds.includes(l.peer) && !blocked.has(l.peer));
    const users = await this.prisma.user.findMany({ where: { id: { in: visible.map((l) => l.peer) }, status: 'ACTIVE' }, select: { id: true, username: true, displayName: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    const unreadBy = new Map(unread.map((g) => [g.senderId, g._count]));
    return visible
      .filter((l) => byId.has(l.peer))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((l) => ({
        user: { ...byId.get(l.peer)!, online: this.presence.isOnline(l.peer) },
        last: { id: l.id, body: l.body, createdAt: l.createdAt, mine: l.senderId === meId },
        unread: unreadBy.get(l.peer) ?? 0,
      }));
  }

  /** Report a message you received. Copies it and the lines around it for the moderators. */
  async report(meId: string, messageId: string, reason: string) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!m || m.recipientId !== meId) throw appError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    const around = await this.prisma.message.findMany({
      where: { OR: [{ senderId: m.senderId, recipientId: meId }, { senderId: meId, recipientId: m.senderId }], createdAt: { lte: m.createdAt } },
      orderBy: { createdAt: 'desc' }, take: 8,
    });
    try {
      await this.prisma.chatReport.create({
        data: {
          reporterId: meId, reportedId: m.senderId, messageId: m.id, messageText: m.body, reason: reason.trim(),
          context: around.reverse().map((x) => ({ from: x.senderId, body: x.body, at: x.createdAt })),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e; // reporting the same message twice is fine
    }
    return { ok: true };
  }
}
