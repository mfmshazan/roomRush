import { MAX_ACCUM_MS, STEP_MS } from "./constants";
import { render } from "./render";
import { step } from "./physics";
import { tickRules } from "./rules";
import type { MatchState } from "./types";
import type { PlayerInput } from "./input";

export function startLoop(
  canvas: HTMLCanvasElement,
  state: MatchState,
  getInput: () => Map<string, PlayerInput>,
  onFullTime: (state: MatchState) => void,
  durationMs: number,
): () => void {
  let rafId = 0;
  let lastTime = performance.now();
  let accum = 0;
  let stopped = false;

  function tick(now: number): void {
    if (stopped) return;
    rafId = requestAnimationFrame(tick);

    if (document.hidden) {
      lastTime = now;
      return;
    }

    const elapsed = now - lastTime;
    lastTime = now;
    accum = Math.min(accum + elapsed, MAX_ACCUM_MS);

    // Apply current input to players before stepping
    const inputMap = getInput();
    for (const p of state.players) {
      const inp = inputMap.get(p.id);
      if (inp) {
        p.input.x = inp.x;
        p.input.y = inp.y;
        if (inp.kick) p.kickQueued = true;
      }
    }

    while (accum >= STEP_MS) {
      accum -= STEP_MS;
      const { goalFor } = step(state, now);
      tickRules(state, goalFor, now, durationMs);

      if (state.phase === "FULL_TIME") {
        stopped = true;
        cancelAnimationFrame(rafId);
        render(canvas, state);
        onFullTime(state);
        return;
      }
    }

    render(canvas, state);
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
  };
}
