"use client";

import { useEffect, useRef } from "react";

export interface PlayerInput {
  x: number;
  y: number;
  kick: boolean;
}

// Keys that should not scroll the page during gameplay
const PREVENT_DEFAULT_KEYS = new Set([
  " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

// Binding: key → which kb player + what it does
type AxisBind = { playerId: string; axis: "x" | "y"; val: number };
type KickBind = { playerId: string; kick: true };
type Binding = AxisBind | KickBind;

const KB_BINDINGS: Record<string, Binding> = {
  // Player kb0: WASD + Space
  "w":          { playerId: "kb0", axis: "y", val: -1 },
  "s":          { playerId: "kb0", axis: "y", val:  1 },
  "a":          { playerId: "kb0", axis: "x", val: -1 },
  "d":          { playerId: "kb0", axis: "x", val:  1 },
  " ":          { playerId: "kb0", kick: true },
  // Player kb1: Arrow keys + Enter
  "ArrowUp":    { playerId: "kb1", axis: "y", val: -1 },
  "ArrowDown":  { playerId: "kb1", axis: "y", val:  1 },
  "ArrowLeft":  { playerId: "kb1", axis: "x", val: -1 },
  "ArrowRight": { playerId: "kb1", axis: "x", val:  1 },
  "Enter":      { playerId: "kb1", kick: true },
};

function emptyInput(): PlayerInput {
  return { x: 0, y: 0, kick: false };
}

export function useKeyboardInput(): () => Map<string, PlayerInput> {
  const stateRef = useRef<Map<string, PlayerInput>>(new Map());
  // Track which axis keys are currently held for clean release
  const heldRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (PREVENT_DEFAULT_KEYS.has(e.key)) e.preventDefault();
      if (heldRef.current.has(e.key)) return; // already held
      heldRef.current.add(e.key);

      const binding = KB_BINDINGS[e.key];
      if (!binding) return;

      const map = stateRef.current;
      const inp = map.get(binding.playerId) ?? emptyInput();

      if ("kick" in binding) {
        map.set(binding.playerId, { ...inp, kick: true });
      } else {
        const updated = { ...inp };
        updated[binding.axis] = clampAxis(inp[binding.axis] + binding.val);
        map.set(binding.playerId, updated);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      heldRef.current.delete(e.key);

      const binding = KB_BINDINGS[e.key];
      if (!binding) return;

      const map = stateRef.current;
      const inp = map.get(binding.playerId) ?? emptyInput();

      if ("kick" in binding) {
        map.set(binding.playerId, { ...inp, kick: false });
      } else {
        const updated = { ...inp };
        updated[binding.axis] = clampAxis(inp[binding.axis] - binding.val);
        map.set(binding.playerId, updated);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return () => stateRef.current;
}

function clampAxis(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
