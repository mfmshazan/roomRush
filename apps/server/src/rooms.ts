import { randomUUID } from "node:crypto";
import type { LobbyPlayer, RoomPhase, RoomSettings, RoomState, Team } from "@roomrush/shared";

// Letters used for room codes — O, I, L excluded to avoid confusion.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const MAX_PLAYERS = 8;
const HOST_TIMEOUT_MS = 2 * 60 * 1000;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface ServerPlayer extends LobbyPlayer {
  token: string;
  socketId: string | null;
}

interface ServerRoom {
  code: string;
  hostSocketId: string | null;
  hostDisconnectTimer: ReturnType<typeof setTimeout> | null;
  players: Map<string, ServerPlayer>;
  phase: RoomPhase;
  settings: RoomSettings;
  lastActivityAt: number;
  createdAt: number;
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function toRoomState(room: ServerRoom): RoomState {
  return {
    code: room.code,
    phase: room.phase,
    hostConnected: room.hostSocketId !== null,
    settings: room.settings,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      number: p.number,
      connected: p.connected,
    })),
  };
}

function assignNumber(room: ServerRoom, team: Team): number {
  const taken = new Set(
    Array.from(room.players.values())
      .filter((p) => p.team === team)
      .map((p) => p.number),
  );
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

function reassignNumbers(room: ServerRoom): void {
  for (const team of ["RED", "BLUE"] as Team[]) {
    let n = 1;
    for (const p of room.players.values()) {
      if (p.team === team) p.number = n++;
    }
  }
}

export type JoinError =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NAME_TAKEN"
  | "MATCH_IN_PROGRESS";

export type RejoinError = "ROOM_NOT_FOUND" | "TOKEN_INVALID";

export class RoomManager {
  private rooms = new Map<string, ServerRoom>();
  private onClose?: (code: string, socketIds: string[]) => void;

  setCloseCallback(cb: (code: string, socketIds: string[]) => void): void {
    this.onClose = cb;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  createRoom(hostSocketId: string): ServerRoom {
    let code: string;
    do { code = generateCode(); } while (this.rooms.has(code));

    const now = Date.now();
    const room: ServerRoom = {
      code,
      hostSocketId,
      hostDisconnectTimer: null,
      players: new Map(),
      phase: "LOBBY",
      settings: { durationSec: 180, goalsToWin: 3 },
      lastActivityAt: now,
      createdAt: now,
    };
    this.rooms.set(code, room);
    console.log(`[room] created ${code}  host=${hostSocketId}`);
    return room;
  }

  // ── Join / Rejoin ─────────────────────────────────────────────────────────

  joinPlayer(
    code: string,
    name: string,
    socketId: string,
  ): { player: ServerPlayer; room: ServerRoom } | { error: JoinError } {
    const room = this.rooms.get(code);
    if (!room) return { error: "ROOM_NOT_FOUND" };
    if (room.phase !== "LOBBY") return { error: "MATCH_IN_PROGRESS" };
    if (room.players.size >= MAX_PLAYERS) return { error: "ROOM_FULL" };

    const nameLower = name.toLowerCase();
    for (const p of room.players.values()) {
      if (p.name.toLowerCase() === nameLower) return { error: "NAME_TAKEN" };
    }

    // Pick smaller team; ties go to RED.
    const redCount = [...room.players.values()].filter((p) => p.team === "RED").length;
    const blueCount = [...room.players.values()].filter((p) => p.team === "BLUE").length;
    const team: Team = blueCount < redCount ? "BLUE" : "RED";

    const player: ServerPlayer = {
      id: randomUUID(),
      token: randomUUID(),
      name,
      team,
      number: assignNumber(room, team),
      connected: true,
      socketId,
    };
    room.players.set(player.id, player);
    room.lastActivityAt = Date.now();
    console.log(`[room] ${code}  joined: ${name} (${team} #${player.number})`);
    return { player, room };
  }

  rejoinPlayer(
    code: string,
    token: string,
    socketId: string,
  ): { player: ServerPlayer; room: ServerRoom } | { error: RejoinError } {
    const room = this.rooms.get(code);
    if (!room) return { error: "ROOM_NOT_FOUND" };

    for (const player of room.players.values()) {
      if (player.token === token) {
        player.socketId = socketId;
        player.connected = true;
        room.lastActivityAt = Date.now();
        console.log(`[room] ${code}  rejoined: ${player.name}`);
        return { player, room };
      }
    }
    return { error: "TOKEN_INVALID" };
  }

  // ── Host actions ──────────────────────────────────────────────────────────

  setTeam(
    code: string,
    playerId: string,
    team: Team,
  ): ServerRoom | null {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return null;
    player.team = team;
    reassignNumbers(room);
    room.lastActivityAt = Date.now();
    return room;
  }

  kickPlayer(code: string, playerId: string): { room: ServerRoom; socketId: string | null } | null {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return null;
    const socketId = player.socketId;
    room.players.delete(playerId);
    reassignNumbers(room);
    room.lastActivityAt = Date.now();
    console.log(`[room] ${code}  kicked: ${player.name}`);
    return { room, socketId };
  }

  updateSettings(code: string, settings: Partial<RoomSettings>): ServerRoom | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    Object.assign(room.settings, settings);
    return room;
  }

  setPhase(code: string, phase: RoomPhase): ServerRoom | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.phase = phase;
    room.lastActivityAt = Date.now();
    return room;
  }

  // ── Host disconnect ───────────────────────────────────────────────────────

  hostDisconnected(socketId: string): ServerRoom | null {
    const room = this.getRoomByHostSocket(socketId);
    if (!room) return null;
    room.hostSocketId = null;
    room.hostDisconnectTimer = setTimeout(() => {
      this.closeRoom(room.code);
    }, HOST_TIMEOUT_MS);
    console.log(`[room] ${room.code}  host disconnected — closing in 2 min`);
    return room;
  }

  hostReconnected(code: string, socketId: string): ServerRoom | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.hostDisconnectTimer) {
      clearTimeout(room.hostDisconnectTimer);
      room.hostDisconnectTimer = null;
    }
    room.hostSocketId = socketId;
    room.lastActivityAt = Date.now();
    console.log(`[room] ${code}  host reconnected`);
    return room;
  }

  // ── Player disconnect ─────────────────────────────────────────────────────

  playerDisconnected(socketId: string): ServerRoom | null {
    const room = this.getRoomByPlayerSocket(socketId);
    if (!room) return null;
    for (const player of room.players.values()) {
      if (player.socketId === socketId) {
        player.connected = false;
        player.socketId = null;
        console.log(`[room] ${room.code}  player disconnected: ${player.name}`);
        break;
      }
    }
    return room;
  }

  // ── Lookups ───────────────────────────────────────────────────────────────

  getRoom(code: string): ServerRoom | undefined {
    return this.rooms.get(code);
  }

  getRoomByHostSocket(socketId: string): ServerRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.hostSocketId === socketId) return room;
    }
    return undefined;
  }

  getRoomByPlayerSocket(socketId: string): ServerRoom | undefined {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.socketId === socketId) return room;
      }
    }
    return undefined;
  }

  // ── Close / Cleanup ───────────────────────────────────────────────────────

  closeRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.hostDisconnectTimer) clearTimeout(room.hostDisconnectTimer);

    const socketIds: string[] = [];
    if (room.hostSocketId) socketIds.push(room.hostSocketId);
    for (const p of room.players.values()) {
      if (p.socketId) socketIds.push(p.socketId);
    }

    this.rooms.delete(code);
    console.log(`[room] ${code}  closed`);
    this.onClose?.(code, socketIds);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActivityAt > IDLE_TIMEOUT_MS;
      const tooOld = now - room.createdAt > MAX_AGE_MS;
      if (idle || tooOld) {
        console.log(`[room] ${code}  cleaning up (idle=${idle}, tooOld=${tooOld})`);
        this.closeRoom(code);
      }
    }
  }

  toRoomState(room: ServerRoom): RoomState {
    return toRoomState(room);
  }
}
