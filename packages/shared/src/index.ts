import { z } from "zod";

// ── Version ─────────────────────────────────────────────────────────────────
export const PROTOCOL_VERSION = "0.1.0";

// ── Domain types ─────────────────────────────────────────────────────────────
export type RoomPhase = "LOBBY" | "MATCH" | "RESULTS";
export type Team = "RED" | "BLUE";
export type MatchPhase = "COUNTDOWN" | "PLAYING" | "GOAL" | "FULL_TIME";

export interface LobbyPlayer {
  id: string;
  name: string;
  team: Team;
  number: number;
  connected: boolean;
}

export interface RoomSettings {
  durationSec: number;
  goalsToWin: number;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  players: LobbyPlayer[];
  settings: RoomSettings;
  hostConnected: boolean;
}

export interface MatchStatus {
  phase: MatchPhase;
  score: { RED: number; BLUE: number };
  timeLeftMs: number;
  lastGoal?: { team: Team; scorerName: string | null; ownGoal: boolean };
}

// ── Socket event names ───────────────────────────────────────────────────────
export const EV = {
  // host → server
  HOST_CREATE_ROOM:  "host:create_room",
  HOST_SET_TEAM:     "host:set_team",
  HOST_KICK_PLAYER:  "host:kick_player",
  HOST_START_MATCH:  "host:start_match",
  HOST_MATCH_STATUS: "host:match_status",
  HOST_PLAY_AGAIN:   "host:play_again",

  // player → server
  PLAYER_JOIN:   "player:join",
  PLAYER_REJOIN: "player:rejoin",
  PLAYER_INPUT:  "player:input",
  PLAYER_KICK:   "player:kick",

  // server → client
  ROOM_STATE:   "room:state",
  INPUT_MOVE:   "input:move",
  INPUT_KICK:   "input:kick",
  MATCH_STATUS: "match:status",
  ROOM_CLOSED:  "room:closed",
} as const;

// ── Zod validation schemas (used on the server for incoming payloads) ────────
export const JoinSchema = z.object({
  code: z.string().length(4),
  name: z.string().min(1).max(16).trim(),
});

export const RejoinSchema = z.object({
  code: z.string().length(4),
  token: z.string().uuid(),
});

export const SetTeamSchema = z.object({
  playerId: z.string(),
  team: z.enum(["RED", "BLUE"]),
});

export const KickPlayerSchema = z.object({
  playerId: z.string(),
});

export const StartMatchSchema = z.object({
  durationSec: z.number().int().min(60).max(600),
  goalsToWin: z.number().int().min(1).max(10),
});

export const PlayerInputSchema = z.object({
  x:    z.number().min(-1).max(1),
  y:    z.number().min(-1).max(1),
  kick: z.boolean(),
});
