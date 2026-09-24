import type { LobbyPlayer, Team } from "@roomrush/shared";
import {
  BALL_R,
  BALL_MASS,
  COUNTDOWN_MS,
  GOAL_FREEZE_MS,
  PITCH_H,
  PITCH_W,
  PLAYER_R,
} from "./constants";
import { makePlayerBody } from "./physics";
import type { GoalEvent, MatchState, SimPlayer } from "./types";

// ── Kickoff positions ─────────────────────────────────────────────────────────

export function kickoffPositions(state: MatchState, nowMs: number): void {
  const red = state.players.filter((p) => p.team === "RED");
  const blue = state.players.filter((p) => p.team === "BLUE");

  placeTeam(red, "RED");
  placeTeam(blue, "BLUE");

  // Stop all players
  for (const p of state.players) {
    p.vx = 0; p.vy = 0;
    p.input = { x: 0, y: 0 };
    p.kickQueued = false;
  }

  // Ball on centre spot
  state.ball.x = PITCH_W / 2;
  state.ball.y = PITCH_H / 2;
  state.ball.vx = 0;
  state.ball.vy = 0;

  state.phase = "COUNTDOWN";
  state.phaseEndsAt = nowMs + COUNTDOWN_MS;
  state.lastTouchId = null;
}

function placeTeam(players: SimPlayer[], team: Team): void {
  const isRed = team === "RED";
  // Red occupies left half (x: PLAYER_R+10 to PITCH_W/2 - 20)
  // Blue occupies right half
  const xMin = isRed ? PLAYER_R + 10 : PITCH_W / 2 + 20;
  const xMax = isRed ? PITCH_W / 2 - 20 : PITCH_W - PLAYER_R - 10;
  const count = players.length;

  players.forEach((p, i) => {
    // Spread vertically
    const t = count === 1 ? 0.5 : i / (count - 1);
    const margin = PLAYER_R * 3;
    p.y = margin + t * (PITCH_H - margin * 2);
    // Alternate columns for more than 2 players
    const col = Math.floor(i / 2) + 1;
    const totalCols = Math.ceil(count / 2);
    const xRange = xMax - xMin;
    p.x = isRed
      ? xMin + (xRange * col) / (totalCols + 1)
      : xMax - (xRange * col) / (totalCols + 1);
    p.vx = 0; p.vy = 0;
  });
}

// ── Init match ────────────────────────────────────────────────────────────────

export function initMatch(lobbyPlayers: LobbyPlayer[], nowMs: number): MatchState {
  const players: SimPlayer[] = lobbyPlayers.map((lp) =>
    makePlayerBody(lp.id, 0, 0, lp.team, lp.name, lp.number, lp.connected),
  );

  const ball = {
    x: PITCH_W / 2, y: PITCH_H / 2,
    vx: 0, vy: 0,
    r: BALL_R, mass: BALL_MASS,
  };

  const state: MatchState = {
    phase: "COUNTDOWN",
    players,
    ball,
    score: { RED: 0, BLUE: 0 },
    timeLeftMs: 3 * 60 * 1000,
    phaseEndsAt: nowMs + COUNTDOWN_MS,
    lastTouchId: null,
    goals: [],
  };

  kickoffPositions(state, nowMs);
  return state;
}

// ── Tick rules ────────────────────────────────────────────────────────────────

export function tickRules(
  state: MatchState,
  goalFor: Team | null,
  nowMs: number,
  durationMs: number,
): void {
  switch (state.phase) {
    case "COUNTDOWN":
      if (nowMs >= state.phaseEndsAt) {
        state.phase = "PLAYING";
      }
      break;

    case "PLAYING":
      if (goalFor) {
        state.score[goalFor]++;

        // Determine scorer
        let scorerId: string | null = state.lastTouchId;
        let ownGoal = false;
        const scorer = state.players.find((p) => p.id === scorerId);
        if (scorer && scorer.team !== goalFor) {
          ownGoal = true;
        }

        const goalEvent: GoalEvent = {
          team: goalFor,
          scorerId,
          scorerName: scorer?.name ?? null,
          ownGoal,
        };
        state.goals.push(goalEvent);
        state.phase = "GOAL";
        state.phaseEndsAt = nowMs + GOAL_FREEZE_MS;
      } else {
        state.timeLeftMs -= 1000 / 60; // one step worth of time
        if (state.timeLeftMs <= 0) {
          state.timeLeftMs = 0;
          state.phase = "FULL_TIME";
        }
      }
      break;

    case "GOAL":
      if (nowMs >= state.phaseEndsAt) {
        kickoffPositions(state, nowMs);
      }
      break;

    case "FULL_TIME":
      // Terminal — loop should stop
      break;
  }
}
