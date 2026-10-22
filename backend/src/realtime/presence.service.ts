import { Injectable } from '@nestjs/common';

/** Which players have at least one open socket. In memory, so one server instance. */
@Injectable()
export class PresenceService {
  private readonly sockets = new Map<string, Set<string>>();
  private readonly offlineSince = new Map<string, number>();
  readonly bootedAt = Date.now();

  /** Returns true when this is the player's first connection (they just came online). */
  add(userId: string, socketId: string): boolean {
    let set = this.sockets.get(userId);
    const first = !set || set.size === 0;
    if (!set) this.sockets.set(userId, (set = new Set()));
    set.add(socketId);
    this.offlineSince.delete(userId);
    return first;
  }

  /** Returns true when that was the player's last connection (they just went offline). */
  remove(userId: string, socketId: string, now = Date.now()): boolean {
    const set = this.sockets.get(userId);
    if (!set || !set.delete(socketId)) return false;
    if (set.size > 0) return false;
    this.sockets.delete(userId);
    this.offlineSince.set(userId, now);
    return true;
  }

  /** How many players have an open connection right now. */
  count(): number {
    return this.sockets.size;
  }

  isOnline(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  /** Milliseconds this player has been offline (since boot if never seen). 0 when online. */
  offlineFor(userId: string, now = Date.now()): number {
    if (this.isOnline(userId)) return 0;
    return now - (this.offlineSince.get(userId) ?? this.bootedAt);
  }
}
