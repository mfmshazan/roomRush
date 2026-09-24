import type { Server, Socket } from "socket.io";
import { EV, JoinSchema, PlayerInputSchema, RejoinSchema } from "@roomrush/shared";
import type { RoomManager } from "../rooms.js";

export function registerPlayerHandlers(
  io: Server,
  socket: Socket,
  rooms: RoomManager,
): void {
  // ── player:join ──────────────────────────────────────────────────────────
  socket.on(EV.PLAYER_JOIN, (payload, ack) => {
    const result = JoinSchema.safeParse(payload);
    if (!result.success) {
      if (typeof ack === "function") ack({ ok: false, error: "INVALID_PAYLOAD" });
      return;
    }
    const { code, name } = result.data;
    const joined = rooms.joinPlayer(code, name, socket.id);
    if ("error" in joined) {
      if (typeof ack === "function") ack({ ok: false, error: joined.error });
      return;
    }
    socket.join(code);
    io.to(code).emit(EV.ROOM_STATE, rooms.toRoomState(joined.room));
    if (typeof ack === "function")
      ack({
        ok: true,
        playerId: joined.player.id,
        token: joined.player.token,
        team: joined.player.team,
        number: joined.player.number,
      });
  });

  // ── player:rejoin ────────────────────────────────────────────────────────
  socket.on(EV.PLAYER_REJOIN, (payload, ack) => {
    const result = RejoinSchema.safeParse(payload);
    if (!result.success) {
      if (typeof ack === "function") ack({ ok: false, error: "INVALID_PAYLOAD" });
      return;
    }
    const { code, token } = result.data;
    const rejoined = rooms.rejoinPlayer(code, token, socket.id);
    if ("error" in rejoined) {
      if (typeof ack === "function") ack({ ok: false, error: rejoined.error });
      return;
    }
    socket.join(code);
    io.to(code).emit(EV.ROOM_STATE, rooms.toRoomState(rejoined.room));
    if (typeof ack === "function")
      ack({
        ok: true,
        playerId: rejoined.player.id,
        team: rejoined.player.team,
        number: rejoined.player.number,
      });
  });

  // ── player:input ─────────────────────────────────────────────────────────
  socket.on(EV.PLAYER_INPUT, (payload) => {
    const result = PlayerInputSchema.safeParse(payload);
    if (!result.success) return;
    const room = rooms.getRoomByPlayerSocket(socket.id);
    if (!room || !room.hostSocketId) return;
    const player = [...room.players.values()].find((p) => p.socketId === socket.id);
    if (!player) return;
    io.to(room.hostSocketId).emit(EV.PLAYER_INPUT, {
      playerId: player.id,
      ...result.data,
    });
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const room = rooms.playerDisconnected(socket.id);
    if (room) {
      io.to(room.code).emit(EV.ROOM_STATE, rooms.toRoomState(room));
    }
  });
}
