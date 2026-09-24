import {
  BALL_R,
  COLOUR_BALL,
  COLOUR_BALL_OUTLINE,
  COLOUR_BLUE,
  COLOUR_HUD_BG,
  COLOUR_LINE,
  COLOUR_PITCH,
  COLOUR_RED,
  COLOUR_STRIPE,
  GOAL_DEPTH,
  GOAL_W,
  PITCH_H,
  PITCH_W,
  PLAYER_R,
} from "./constants";
import type { MatchState } from "./types";

// ── Pitch offscreen cache ─────────────────────────────────────────────────────

let pitchCache: HTMLCanvasElement | null = null;

function buildPitchCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PITCH_W;
  c.height = PITCH_H;
  const ctx = c.getContext("2d")!;

  // Base green
  ctx.fillStyle = COLOUR_PITCH;
  ctx.fillRect(0, 0, PITCH_W, PITCH_H);

  // Mowing stripes (alternating bands every 100 units)
  ctx.fillStyle = COLOUR_STRIPE;
  for (let x = 100; x < PITCH_W; x += 200) {
    ctx.fillRect(x, 0, 100, PITCH_H);
  }

  // Pitch border
  ctx.strokeStyle = COLOUR_LINE;
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, PITCH_W - 6, PITCH_H - 6);

  // Halfway line
  ctx.beginPath();
  ctx.moveTo(PITCH_W / 2, 3);
  ctx.lineTo(PITCH_W / 2, PITCH_H - 3);
  ctx.stroke();

  // Centre circle
  ctx.beginPath();
  ctx.arc(PITCH_W / 2, PITCH_H / 2, 80, 0, Math.PI * 2);
  ctx.stroke();

  // Centre spot
  ctx.fillStyle = COLOUR_LINE;
  ctx.beginPath();
  ctx.arc(PITCH_W / 2, PITCH_H / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Goal mouths
  const goalTop = PITCH_H / 2 - GOAL_W / 2;
  ctx.strokeStyle = COLOUR_LINE;
  ctx.lineWidth = 3;
  // Left goal
  ctx.strokeRect(-GOAL_DEPTH, goalTop, GOAL_DEPTH + 3, GOAL_W);
  // Right goal
  ctx.strokeRect(PITCH_W - 3, goalTop, GOAL_DEPTH, GOAL_W);

  return c;
}

// ── Scale helpers ─────────────────────────────────────────────────────────────

function getScale(canvas: HTMLCanvasElement): { scale: number; offX: number; offY: number } {
  const scaleX = canvas.width / PITCH_W;
  const scaleY = canvas.height / PITCH_H;
  const scale = Math.min(scaleX, scaleY);
  const offX = (canvas.width - PITCH_W * scale) / 2;
  const offY = (canvas.height - PITCH_H * scale) / 2;
  return { scale, offX, offY };
}

function toScreen(
  gx: number, gy: number,
  scale: number, offX: number, offY: number,
): [number, number] {
  return [offX + gx * scale, offY + gy * scale];
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(canvas: HTMLCanvasElement, state: MatchState): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Resize canvas to fill its CSS size
  const dpr = window.devicePixelRatio ?? 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);
    pitchCache = null; // rebuild at new size
  }

  const { scale, offX, offY } = getScale(canvas);

  // Background fill (letterbox)
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

  // Draw pitch
  if (!pitchCache) pitchCache = buildPitchCanvas();
  ctx.drawImage(
    pitchCache,
    offX, offY,
    PITCH_W * scale, PITCH_H * scale,
  );

  // ── Players ──────────────────────────────────────────────────────────────
  for (const p of state.players) {
    const [sx, sy] = toScreen(p.x, p.y, scale, offX, offY);
    const sr = p.r * scale;

    ctx.globalAlpha = p.connected ? 1 : 0.4;
    ctx.fillStyle = p.team === "RED" ? COLOUR_RED : COLOUR_BLUE;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number
    const fontSize = Math.max(8, sr * 0.9);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.number), sx, sy);

    // Name label above
    const labelSize = Math.max(7, sr * 0.55);
    ctx.font = `${labelSize}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(p.name, sx, sy - sr - 3);
    ctx.globalAlpha = 1;
  }

  // ── Ball ──────────────────────────────────────────────────────────────────
  const [bx, by] = toScreen(state.ball.x, state.ball.y, scale, offX, offY);
  const br = BALL_R * scale;
  ctx.fillStyle = COLOUR_BALL;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLOUR_BALL_OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── HUD ───────────────────────────────────────────────────────────────────
  drawHUD(ctx, state, canvas.width / dpr, canvas.height / dpr);

  // ── Overlays ──────────────────────────────────────────────────────────────
  if (state.phase === "COUNTDOWN") drawCountdown(ctx, state, canvas.width / dpr, canvas.height / dpr);
  if (state.phase === "GOAL") drawGoal(ctx, state, canvas.width / dpr, canvas.height / dpr);
  if (state.phase === "FULL_TIME") drawFullTime(ctx, state, canvas.width / dpr, canvas.height / dpr);
}

// ── HUD ───────────────────────────────────────────────────────────────────────

const HUD_H = 44;

function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: MatchState,
  w: number,
  _h: number,
): void {
  ctx.fillStyle = COLOUR_HUD_BG;
  ctx.fillRect(0, 0, w, HUD_H);

  const sec = Math.ceil(state.timeLeftMs / 1000);
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, "0");
  const timerStr = `${mm}:${ss}`;

  // Score
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = COLOUR_RED;
  ctx.fillText(String(state.score.RED), w / 2 - 60, HUD_H / 2);

  ctx.fillStyle = "#fff";
  ctx.fillText("—", w / 2, HUD_H / 2);

  ctx.fillStyle = COLOUR_BLUE;
  ctx.fillText(String(state.score.BLUE), w / 2 + 60, HUD_H / 2);

  // Timer
  ctx.font = "bold 20px monospace";
  ctx.fillStyle = state.timeLeftMs < 30_000 ? "#FF4444" : "#fff";
  ctx.textAlign = "right";
  ctx.fillText(timerStr, w - 20, HUD_H / 2);

  // Team labels
  ctx.font = "12px sans-serif";
  ctx.fillStyle = COLOUR_RED;
  ctx.textAlign = "left";
  ctx.fillText("RED", 16, HUD_H / 2);
  ctx.fillStyle = COLOUR_BLUE;
  ctx.textAlign = "right";
  ctx.fillText("BLUE", w - 80, HUD_H / 2);
}

// ── Overlays ──────────────────────────────────────────────────────────────────

function drawCountdown(
  ctx: CanvasRenderingContext2D,
  state: MatchState,
  w: number,
  h: number,
): void {
  const remaining = Math.ceil((state.phaseEndsAt - Date.now()) / 1000);
  const label = remaining > 0 ? String(remaining) : "GO!";

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, w, h);

  ctx.font = `bold ${Math.min(w, h) * 0.25}px monospace`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2);
}

function drawGoal(
  ctx: CanvasRenderingContext2D,
  state: MatchState,
  w: number,
  h: number,
): void {
  const lastGoal = state.goals[state.goals.length - 1];

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, w, h);

  ctx.font = `bold ${Math.min(w, h) * 0.18}px monospace`;
  ctx.fillStyle = lastGoal?.team === "RED" ? COLOUR_RED : COLOUR_BLUE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GOAL!", w / 2, h / 2 - 20);

  if (lastGoal?.scorerName) {
    ctx.font = `${Math.min(w, h) * 0.07}px sans-serif`;
    ctx.fillStyle = "#fff";
    const label = lastGoal.ownGoal
      ? `${lastGoal.scorerName} (OG)`
      : lastGoal.scorerName;
    ctx.fillText(label, w / 2, h / 2 + 40);
  }
}

function drawFullTime(
  ctx: CanvasRenderingContext2D,
  state: MatchState,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, w, h);

  ctx.font = `bold ${Math.min(w, h) * 0.12}px monospace`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FULL TIME", w / 2, h / 2 - 30);

  ctx.font = `bold ${Math.min(w, h) * 0.15}px monospace`;
  ctx.fillStyle = COLOUR_RED;
  ctx.fillText(String(state.score.RED), w / 2 - 70, h / 2 + 30);
  ctx.fillStyle = "#fff";
  ctx.font = `${Math.min(w, h) * 0.08}px monospace`;
  ctx.fillText("—", w / 2, h / 2 + 30);
  ctx.font = `bold ${Math.min(w, h) * 0.15}px monospace`;
  ctx.fillStyle = COLOUR_BLUE;
  ctx.fillText(String(state.score.BLUE), w / 2 + 70, h / 2 + 30);
}
