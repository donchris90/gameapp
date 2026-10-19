import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ChatService, MESSAGES_PER_MINUTE } from '../src/chat/chat.service';
import { PushService } from '../src/push/push.service';
import { Player, bearer, befriend, createApp, newPlayer, prismaOf } from './helpers';

describe('Friends chat, push and reports', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const say = (from: Player, to: Player, body: string) => http().post(`/chat/with/${to.user.id}`).set(bearer(from)).send({ body });
  const thread = (me: Player, other: Player, q = '') => http().get(`/chat/with/${other.user.id}${q}`).set(bearer(me));
  async function friends() {
    const a = await newPlayer(app), b = await newPlayer(app);
    await befriend(app, a, b);
    return [a, b] as const;
  }

  it('friends can talk; the thread shows both sides oldest first', async () => {
    const [a, b] = await friends();
    await say(a, b, 'hello  ').expect(200);
    const r = (await say(b, a, 'hi there').expect(200)).body;
    expect(r).toMatchObject({ from: b.user.id, to: a.user.id, body: 'hi there', readAt: null });
    const t = (await thread(a, b).expect(200)).body;
    expect(t.messages.map((m: any) => m.body)).toEqual(['hello', 'hi there']);
    expect(t.nextBefore).toBeNull();
  });

  it('strangers, blocked players and yourself cannot chat, and the answer never says why', async () => {
    const a = await newPlayer(app), stranger = await newPlayer(app);
    expect((await say(a, stranger, 'hey').expect(403)).body.error).toBe('CANNOT_CHAT');
    await thread(a, stranger).expect(403);
    const [x, y] = await friends();
    await http().post(`/blocks/${y.user.id}`).set(bearer(x)).expect(200);
    expect((await say(x, y, 'hi').expect(403)).body.error).toBe('CANNOT_CHAT');
    expect((await say(y, x, 'hi').expect(403)).body.error).toBe('CANNOT_CHAT');
    await say(a, a, 'me').expect(403);
  });

  it('checks the message: not empty, not too long, no hidden control characters', async () => {
    const [a, b] = await friends();
    expect((await say(a, b, '   ').expect(400)).body.error).toBe('EMPTY_MESSAGE');
    expect((await say(a, b, 'x'.repeat(501)).expect(400)).body.error).toBe('MESSAGE_TOO_LONG');
    expect((await say(a, b, 'hi‮there').expect(400)).body.error).toBe('BAD_CHARACTERS');
    await say(a, b, 'x'.repeat(500)).expect(200);
    await say(a, b, 'line one\nline two 😀 ọ̀rẹ́').expect(200);
  });

  it('slows down a sender who floods', async () => {
    const [a, b] = await friends();
    for (let i = 0; i < MESSAGES_PER_MINUTE; i++) await say(a, b, `m${i}`).expect(200);
    expect((await say(a, b, 'one more').expect(429)).body.error).toBe('SLOW_DOWN');
    await say(b, a, 'I can still answer').expect(200);
  });

  it('pages back through long chats', async () => {
    const [a, b] = await friends();
    for (let i = 0; i < 7; i++) await say(a, b, `n${i}`).expect(200);
    const first = (await thread(b, a, '?limit=3').expect(200)).body;
    expect(first.messages.map((m: any) => m.body)).toEqual(['n4', 'n5', 'n6']);
    const older = (await thread(b, a, `?limit=3&before=${first.nextBefore}`).expect(200)).body;
    expect(older.messages.map((m: any) => m.body)).toEqual(['n1', 'n2', 'n3']);
  });

  it('counts unread messages per friend and clears them when read', async () => {
    const [a, b] = await friends();
    const c = await newPlayer(app);
    await befriend(app, a, c);
    await say(b, a, 'one').expect(200);
    await say(b, a, 'two').expect(200);
    await say(c, a, 'three').expect(200);
    expect((await http().get('/chat/unread').set(bearer(a)).expect(200)).body.total).toBe(3);
    const list = (await http().get('/chat/conversations').set(bearer(a)).expect(200)).body;
    expect(list).toHaveLength(2);
    expect(list[0].user.id).toBe(c.user.id); // newest conversation first
    expect(list.find((x: any) => x.user.id === b.user.id)).toMatchObject({ unread: 2, last: { body: 'two', mine: false } });
    expect((await http().post(`/chat/with/${b.user.id}/read`).set(bearer(a)).expect(200)).body.read).toBe(2);
    expect((await http().get('/chat/unread').set(bearer(a)).expect(200)).body.total).toBe(1);
    // your own messages never count as unread for you
    expect((await http().get('/chat/unread').set(bearer(b)).expect(200)).body.total).toBe(0);
  });

  it('hides a conversation once you unfriend or block', async () => {
    const [a, b] = await friends();
    await say(a, b, 'bye').expect(200);
    expect((await http().get('/chat/conversations').set(bearer(b)).expect(200)).body).toHaveLength(1);
    await http().delete(`/friends/${a.user.id}`).set(bearer(b)).expect(200);
    expect((await http().get('/chat/conversations').set(bearer(b)).expect(200)).body).toHaveLength(0);
  });

  describe('push notifications', () => {
    const outbox = () => app.get(PushService).outbox;
    const settle = () => new Promise((r) => setTimeout(r, 250)); // notifications are sent in the background
    const reg = (p: Player, token: string) => http().post('/push/token').set(bearer(p)).send({ token, platform: 'android' });

    it('registers a phone, and an offline friend gets a notification with the message', async () => {
      const [a, b] = await friends();
      await reg(b, 'ExponentPushToken[abcdefghijklmnop]').expect(200);
      await say(a, b, 'are you there?').expect(200);
      await settle();
      const hit = outbox().filter((o) => o.userId === b.user.id);
      expect(hit).toHaveLength(1);
      expect(hit[0].message).toMatchObject({ title: a.user.displayName ?? a.user.username, body: 'are you there?', data: { type: 'chat', from: a.user.id } });
    });

    it('rejects things that are not push tokens, and moves a phone to whoever signed in last', async () => {
      const [a, b] = await friends();
      await reg(a, 'not-a-token').expect(400);
      await reg(a, 'ExponentPushToken[sharedphone12345]').expect(200);
      await reg(b, 'ExponentPushToken[sharedphone12345]').expect(200);
      expect(await prismaOf(app).pushToken.count({ where: { userId: a.user.id } })).toBe(0);
      expect(await prismaOf(app).pushToken.count({ where: { userId: b.user.id } })).toBe(1);
      await http().delete('/push/token').set(bearer(b)).send({ token: 'ExponentPushToken[sharedphone12345]' }).expect(200);
      expect(await prismaOf(app).pushToken.count({ where: { userId: b.user.id } })).toBe(0);
    });

    it('nobody without a registered phone is notified, and a game invite also notifies', async () => {
      const [a, b] = await friends();
      const before = outbox().length;
      await say(a, b, 'no phone').expect(200);
      await settle();
      expect(outbox().length).toBe(before);
      await reg(b, 'ExponentPushToken[invitephone12345]').expect(200);
      await http().post('/rooms').set(bearer(a)).send({ game: 'TICTACTOE', stake: 0 }).expect(201);
      await http().post('/rooms/current/invite').set(bearer(a)).send({ userId: b.user.id }).expect(200);
      await settle();
      const hit = outbox().filter((o) => o.userId === b.user.id);
      expect(hit.at(-1)!.message).toMatchObject({ title: 'Game invite', data: { type: 'invite' } });
    });
  });

  describe('reports', () => {
    it('saves the message and the lines around it, once, and only for messages you received', async () => {
      const [a, b] = await friends();
      await say(a, b, 'first').expect(200);
      const bad = (await say(a, b, 'something nasty').expect(200)).body;
      const report = (p: Player, id: string) => http().post('/chat/report').set(bearer(p)).send({ messageId: id, reason: 'abuse' });
      await report(a, bad.id).expect(404); // cannot report your own message
      await report(b, bad.id).expect(200);
      await report(b, bad.id).expect(200);
      const rows = await prismaOf(app).chatReport.findMany({ where: { reporterId: b.user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ reportedId: a.user.id, messageText: 'something nasty', status: 'OPEN' });
      expect((rows[0].context as any[]).map((x) => x.body)).toEqual(['first', 'something nasty']);
    });

    it('admins see open reports and can close them with a note, which is audited', async () => {
      const [a, b] = await friends();
      const m = (await say(a, b, 'rude words').expect(200)).body;
      await http().post('/chat/report').set(bearer(b)).send({ messageId: m.id, reason: 'insults' }).expect(200);
      const admin = await newPlayer(app);
      await prismaOf(app).user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
      await http().get('/admin/reports').set(bearer(b)).expect(403);
      const open = (await http().get('/admin/reports').set(bearer(admin)).expect(200)).body.reports;
      const mine = open.find((r: any) => r.messageText === 'rude words');
      expect(mine).toMatchObject({ reason: 'insults', reporter: { id: b.user.id }, reported: { id: a.user.id } });
      await http().post(`/admin/reports/${mine.id}/resolve`).set(bearer(admin)).send({ note: 'warned' }).expect(200);
      const after = (await http().get('/admin/reports').set(bearer(admin)).expect(200)).body.reports;
      expect(after.find((r: any) => r.id === mine.id)).toBeUndefined();
      expect(await prismaOf(app).auditLog.count({ where: { action: 'RESOLVE_REPORT', targetUserId: a.user.id } })).toBe(1);
    });
  });

  it('old messages are removed after the retention period', async () => {
    const [a, b] = await friends();
    await say(a, b, 'ancient').expect(200);
    await prismaOf(app).message.updateMany({ where: { senderId: a.user.id }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000) } });
    await say(a, b, 'fresh').expect(200);
    expect(await app.get(ChatService).cleanup()).toBeGreaterThanOrEqual(1);
    expect((await thread(a, b).expect(200)).body.messages.map((m: any) => m.body)).toEqual(['fresh']);
  });

  it('deleting an account erases its messages and phones', async () => {
    const [a, b] = await friends();
    await say(a, b, 'secret').expect(200);
    await say(b, a, 'reply').expect(200);
    await http().post('/push/token').set(bearer(a)).send({ token: 'ExponentPushToken[gonegonegone123]', platform: 'ios' }).expect(200);
    await http().post('/users/me/delete').set(bearer(a)).send({ password: a.body.password }).expect(200);
    expect(await prismaOf(app).message.count({ where: { OR: [{ senderId: a.user.id }, { recipientId: a.user.id }] } })).toBe(0);
    expect(await prismaOf(app).pushToken.count({ where: { userId: a.user.id } })).toBe(0);
  });
});
