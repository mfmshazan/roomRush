import type { Team } from "@roomrush/shared";
import {
  BALL_DAMPING,
  BALL_R,
  GOAL_W,
  KICK_COOLDOWN_MS,
  KICK_RANGE,
  KICK_STRENGTH,
  PITCH_H,
  PITCH_W,
  PLAYER_ACCEL,
  PLAYER_DAMPING,
  PLAYER_MASS,
  PLAYER_MAX_SPEED,
  PLAYER_R,
  WALL_BOUNCE,
} from "./constants";
import type { Body, MatchState, SimPlayer } from "./types";

// ── Vector helpers ────────────────────────────────────────────────────────────

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Circle–circle collision resolution ───────────────────────────────────────

function resolveCircles(a: Body, b: Body, restitution = 1): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return;

  const overlap = a.r + b.r - d;
  if (overlap <= 0) return;

  // Separate along normal
  const nx = dx / d;
  const ny = dy / d;
  const totalMass = a.mass + b.mass;
  const pushA = (b.mass / totalMass) * overlap;
  const pushB = (a.mass / totalMass) * overlap;
  a.x -= nx * pushA;
  a.y -= ny * pushA;
  b.x += nx * pushB;
  b.y += ny * pushB;

  // Impulse along normal
  const relVx = b.vx - a.vx;
  const relVy = b.vy - a.vy;
  const relVn = relVx * nx + relVy * ny;
  if (relVn >= 0) return; // already separating

  const j = -(1 + restitution) * relVn / totalMass;
  a.vx -= j * b.mass * nx;
  a.vy -= j * b.mass * ny;
  b.vx += j * a.mass * nx;
  b.vy += j * a.mass * ny;
}

// ── Goal mouth check ─────────────────────────────────────────────────────────

const GOAL_TOP = PITCH_H / 2 - GOAL_W / 2;
const GOAL_BOT = PITCH_H / 2 + GOAL_W / 2;

function inGoalMouth(y: number): boolean {
  return y >= GOAL_TOP && y <= GOAL_BOT;
}

// ── Main step ─────────────────────────────────────────────────────────────────

export function step(state: MatchState, nowMs: number): { goalFor: Team | null } {
  const { players, ball } = state;

  // 1. Apply player input + damping + kick
  for (const p of players) {
    p.vx += p.input.x * PLAYER_ACCEL;
    p.vy += p.input.y * PLAYER_ACCEL;

    // Clamp to max speed
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (spd > PLAYER_MAX_SPEED) {
      p.vx = (p.vx / spd) * PLAYER_MAX_SPEED;
      p.vy = (p.vy / spd) * PLAYER_MAX_SPEED;
    }

    p.vx *= PLAYER_DAMPING;
    p.vy *= PLAYER_DAMPING;

    // Kick
    if (p.kickQueued && nowMs >= p.kickCooldownUntil) {
      const d2 = dist2(p.x, p.y, ball.x, ball.y);
      if (d2 <= KICK_RANGE * KICK_RANGE) {
        const d = Math.sqrt(d2) || 1;
        const nx = (ball.x - p.x) / d;
        const ny = (ball.y - p.y) / d;
        ball.vx += nx * KICK_STRENGTH;
        ball.vy += ny * KICK_STRENGTH;
        state.lastTouchId = p.id;
        p.kickCooldownUntil = nowMs + KICK_COOLDOWN_MS;
      }
      p.kickQueued = false;
    } else if (p.kickQueued) {
      p.kickQueued = false; // cooldown not yet expired
    }

    // Move player
    p.x += p.vx;
    p.y += p.vy;

    // Clamp player inside pitch
    p.x = clamp(p.x, PLAYER_R, PITCH_W - PLAYER_R);
    p.y = clamp(p.y, PLAYER_R, PITCH_H - PLAYER_R);
    // Zero velocity on wall contact
    if (p.x <= PLAYER_R || p.x >= PITCH_W - PLAYER_R) p.vx = 0;
    if (p.y <= PLAYER_R || p.y >= PITCH_H - PLAYER_R) p.vy = 0;
  }

  // 2. Ball damping + move
  ball.vx *= BALL_DAMPING;
  ball.vy *= BALL_DAMPING;
  ball.x += ball.vx;
  ball.y += ball.vy;

  // 3. Player–player collisions
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      resolveCircles(players[i] as Body, players[j] as Body, 0.5);
    }
  }

  // 4. Player–ball collisions
  for (const p of players) {
    const before = { vx: ball.vx, vy: ball.vy };
    resolveCircles(p as Body, ball, 0.8);
    const changed = ball.vx !== before.vx || ball.vy !== before.vy;
    if (changed) state.lastTouchId = p.id;
  }

  // 5. Ball wall collisions
  // Top / Bottom
  if (ball.y - BALL_R < 0) {
    ball.y = BALL_R;
    ball.vy = Math.abs(ball.vy) * WALL_BOUNCE;
  } else if (ball.y + BALL_R > PITCH_H) {
    ball.y = PITCH_H - BALL_R;
    ball.vy = -Math.abs(ball.vy) * WALL_BOUNCE;
  }

  // Left wall — only if NOT in goal mouth
  if (ball.x - BALL_R < 0 && !inGoalMouth(ball.y)) {
    ball.x = BALL_R;
    ball.vx = Math.abs(ball.vx) * WALL_BOUNCE;
  }
  // Right wall — only if NOT in goal mouth
  if (ball.x + BALL_R > PITCH_W && !inGoalMouth(ball.y)) {
    ball.x = PITCH_W - BALL_R;
    ball.vx = -Math.abs(ball.vx) * WALL_BOUNCE;
  }

  // 6. Goal check — ball fully past the goal line inside the mouth
  let goalFor: Team | null = null;
  if (ball.x + BALL_R < 0 && inGoalMouth(ball.y)) {
    // Entered left goal → BLUE scores
    goalFor = "BLUE";
  } else if (ball.x - BALL_R > PITCH_W && inGoalMouth(ball.y)) {
    // Entered right goal → RED scores
    goalFor = "RED";
  }

  return { goalFor };
}

// ── Exported helpers used by rules.ts ────────────────────────────────────────

export function makePlayerBody(
  id: string,
  x: number,
  y: number,
  team: "RED" | "BLUE",
  name: string,
  number: number,
  connected: boolean,
): SimPlayer {
  return {
    id, name, team, number, connected,
    x, y, vx: 0, vy: 0,
    r: PLAYER_R, mass: PLAYER_MASS,
    input: { x: 0, y: 0 },
    kickQueued: false,
    kickCooldownUntil: 0,
  };
}
