import { describe, it, expect, beforeEach } from "vitest";
import { step, makePlayerBody } from "./physics.js";
import { BALL_R, BALL_MASS, PITCH_H, PITCH_W, GOAL_W, KICK_COOLDOWN_MS } from "./constants.js";
import type { MatchState, SimPlayer } from "./types.js";

function makeState(overrides: Partial<MatchState> = {}): MatchState {
  const ball = {
    x: PITCH_W / 2, y: PITCH_H / 2,
    vx: 0, vy: 0,
    r: BALL_R, mass: BALL_MASS,
  };
  return {
    phase: "PLAYING",
    players: [],
    ball,
    score: { RED: 0, BLUE: 0 },
    timeLeftMs: 180_000,
    phaseEndsAt: 0,
    lastTouchId: null,
    goals: [],
    ...overrides,
  };
}

// ── 1. Ball bounces off top wall ──────────────────────────────────────────────

describe("wall bounce", () => {
  it("ball hitting top wall reflects vy with WALL_BOUNCE coefficient", () => {
    const state = makeState();
    state.ball.y = BALL_R + 0.1; // just inside top wall
    state.ball.vy = -5;          // moving up

    step(state, 0);

    expect(state.ball.vy).toBeGreaterThan(0); // reflected
    // Should be close to 5 * WALL_BOUNCE = 3
    expect(state.ball.vy).toBeCloseTo(5 * 0.6, 0);
  });

  it("ball hitting bottom wall reflects vy", () => {
    const state = makeState();
    state.ball.y = PITCH_H - BALL_R - 0.1;
    state.ball.vy = 5;

    step(state, 0);

    expect(state.ball.vy).toBeLessThan(0);
  });
});

// ── 2. Ball in goal mouth → goal detected ────────────────────────────────────

describe("goal detection", () => {
  it("ball past left goal line inside mouth → BLUE scores", () => {
    const state = makeState();
    state.ball.x = -BALL_R - 1;        // fully past left line
    state.ball.y = PITCH_H / 2;         // centre of goal mouth
    state.ball.vx = -5;

    const { goalFor } = step(state, 0);
    expect(goalFor).toBe("BLUE");
  });

  it("ball past right goal line inside mouth → RED scores", () => {
    const state = makeState();
    state.ball.x = PITCH_W + BALL_R + 1;
    state.ball.y = PITCH_H / 2;
    state.ball.vx = 5;

    const { goalFor } = step(state, 0);
    expect(goalFor).toBe("RED");
  });

  it("ball past left line but OUTSIDE mouth → no goal (hits post area)", () => {
    const state = makeState();
    state.ball.x = -BALL_R - 1;
    state.ball.y = PITCH_H / 2 - GOAL_W / 2 - BALL_R - 5; // above goal mouth
    state.ball.vx = -5;

    // Ball should be clamped/bounced by wall, not go in
    const { goalFor } = step(state, 0);
    expect(goalFor).toBeNull();
  });
});

// ── 3. Two overlapping players are separated ──────────────────────────────────

describe("player collisions", () => {
  it("two overlapping players are pushed apart", () => {
    const p1 = makePlayerBody("p1", 100, 100, "RED", "Alice", 1, true);
    const p2 = makePlayerBody("p2", 104, 100, "BLUE", "Bob", 1, true); // overlap: r+r=32 > 4

    const state = makeState({ players: [p1, p2] });
    step(state, 0);

    const dx = Math.abs(state.players[1].x - state.players[0].x);
    // After resolution they should be at least r+r apart
    expect(dx).toBeGreaterThanOrEqual(31); // 32 - small float tolerance
  });
});

// ── 4. Kick during cooldown has no effect ─────────────────────────────────────

describe("kick cooldown", () => {
  it("kick during cooldown does not accelerate the ball", () => {
    const p = makePlayerBody("p1", PITCH_W / 2 - 20, PITCH_H / 2, "RED", "Alice", 1, true);
    p.kickQueued = true;
    p.kickCooldownUntil = 9999; // far in the future

    const state = makeState({ players: [p] });
    const ballVxBefore = state.ball.vx;

    step(state, 0); // nowMs=0 < cooldownUntil=9999 → no kick

    expect(state.ball.vx).toBeCloseTo(ballVxBefore, 5);
  });
});

// ── 5. Kick within range launches ball ───────────────────────────────────────

describe("kick", () => {
  it("kick within range adds velocity to the ball away from player", () => {
    const p = makePlayerBody("p1", PITCH_W / 2 - 20, PITCH_H / 2, "RED", "Alice", 1, true);
    p.kickQueued = true;
    p.kickCooldownUntil = 0;

    // Ball is directly to the right of the player, within kick range
    const state = makeState({ players: [p] });
    state.ball.x = PITCH_W / 2 - 20 + 24; // 24 units right of player centre
    state.ball.y = PITCH_H / 2;

    step(state, 0);

    // Ball should have been kicked to the right
    expect(state.ball.vx).toBeGreaterThan(0);
    expect(state.lastTouchId).toBe("p1");
  });
});
