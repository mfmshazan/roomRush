import type { Team } from "@roomrush/shared";

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  mass: number;
}

export interface SimPlayer extends Body {
  id: string;
  name: string;
  team: Team;
  number: number;
  connected: boolean;
  input: { x: number; y: number };
  kickQueued: boolean;
  kickCooldownUntil: number;
}

export type MatchPhase = "COUNTDOWN" | "PLAYING" | "GOAL" | "FULL_TIME";

export interface GoalEvent {
  team: Team;
  scorerId: string | null;
  scorerName: string | null;
  ownGoal: boolean;
}

export interface MatchState {
  phase: MatchPhase;
  players: SimPlayer[];
  ball: Body;
  score: { RED: number; BLUE: number };
  timeLeftMs: number;
  phaseEndsAt: number;
  lastTouchId: string | null;
  goals: GoalEvent[];
}
