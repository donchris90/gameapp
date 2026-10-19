import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Thin wrapper services use to push events. Does nothing until the gateway has started. */
@Injectable()
export class RealtimeService {
  server?: Server;

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToRoom(roomId: string, event: string, payload: unknown) {
    this.server?.to(`room:${roomId}`).emit(event, payload);
  }

  /** Puts every open socket of this player into the room's channel. */
  joinRoomChannel(userId: string, roomId: string) {
    this.server?.in(`user:${userId}`).socketsJoin(`room:${roomId}`);
  }

  leaveRoomChannel(userId: string, roomId: string) {
    this.server?.in(`user:${userId}`).socketsLeave(`room:${roomId}`);
  }
}
