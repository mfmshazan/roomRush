import type { Server, Socket } from "socket.io";
import {
  EV,
  KickPlayerSchema,
  SetTeamSchema,
  StartMatchSchema,
} from "@roomrush/shared";
import type { RoomManager } from "../rooms.js";

export function registerHostHandlers(
  io: Server,
  socket: Socket,
  rooms: RoomManager,
): void {
  // ── host:create_room ─────────────────────────────────────────────────────
  socket.on(EV.HOST_CREATE_ROOM, (_payload, ack) => {
    const room = rooms.createRoom(socket.id);
    socket.join(room.code);
    if (typeof ack === "function") ack({ ok: true, code: room.code });
  });

  // ── host:set_team ────────────────────────────────────────────────────────
  socket.on(EV.HOST_SET_TEAM, (payload, ack) => {
    const result = SetTeamSchema.safeParse(payload);
    if (!result.success) {
      if (typeof ack === "function") ack({ ok: false, error: "INVALID_PAYLOAD" });
      return;
    }
    const hostRoom = rooms.getRoomByHostSocket(socket.id);
    if (!hostRoom) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    const room = rooms.setTeam(hostRoom.code, result.data.playerId, result.data.team);
    if (!room) {
      if (typeof ack === "function") ack({ ok: false, error: "PLAYER_NOT_FOUND" });
      return;
    }
    io.to(room.code).emit(EV.ROOM_STATE, rooms.toRoomState(room));
    if (typeof ack === "function") ack({ ok: true });
  });

  // ── host:kick_player ─────────────────────────────────────────────────────
  socket.on(EV.HOST_KICK_PLAYER, (payload, ack) => {
    const result = KickPlayerSchema.safeParse(payload);
    if (!result.success) {
      if (typeof ack === "function") ack({ ok: false, error: "INVALID_PAYLOAD" });
      return;
    }
    const hostRoom = rooms.getRoomByHostSocket(socket.id);
    if (!hostRoom) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    const kicked = rooms.kickPlayer(hostRoom.code, result.data.playerId);
    if (!kicked) {
      if (typeof ack === "function") ack({ ok: false, error: "PLAYER_NOT_FOUND" });
      return;
    }
    // Notify the kicked socket before broadcasting the new state.
    if (kicked.socketId) {
      io.to(kicked.socketId).emit(EV.ROOM_CLOSED, { reason: "KICKED" });
    }
    io.to(kicked.room.code).emit(EV.ROOM_STATE, rooms.toRoomState(kicked.room));
    if (typeof ack === "function") ack({ ok: true });
  });

  // ── host:start_match ─────────────────────────────────────────────────────
  socket.on(EV.HOST_START_MATCH, (payload, ack) => {
    const result = StartMatchSchema.safeParse(payload);
    if (!result.success) {
      if (typeof ack === "function") ack({ ok: false, error: "INVALID_PAYLOAD" });
      return;
    }
    const hostRoom = rooms.getRoomByHostSocket(socket.id);
    if (!hostRoom) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    rooms.updateSettings(hostRoom.code, {
      durationSec: result.data.durationSec,
      goalsToWin: result.data.goalsToWin,
    });
    const room = rooms.setPhase(hostRoom.code, "MATCH");
    if (!room) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    io.to(room.code).emit(EV.ROOM_STATE, rooms.toRoomState(room));
    if (typeof ack === "function") ack({ ok: true });
  });

  // ── host:play_again ──────────────────────────────────────────────────────
  socket.on(EV.HOST_PLAY_AGAIN, (_payload, ack) => {
    const hostRoom = rooms.getRoomByHostSocket(socket.id);
    if (!hostRoom) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    const room = rooms.setPhase(hostRoom.code, "LOBBY");
    if (!room) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    io.to(room.code).emit(EV.ROOM_STATE, rooms.toRoomState(room));
    if (typeof ack === "function") ack({ ok: true });
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const room = rooms.hostDisconnected(socket.id);
    if (room) {
      io.to(room.code).emit(EV.ROOM_STATE, rooms.toRoomState(room));
    }
  });
}
