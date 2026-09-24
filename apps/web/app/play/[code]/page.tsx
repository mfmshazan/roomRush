"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSocket } from "../../../lib/socket";
import { EV } from "@roomrush/shared";
import type { MatchStatus, RoomState, Team } from "@roomrush/shared";

const TEAM_BG = { RED: "#D7263D", BLUE: "#1B66D1" } as const;

type Phase = "loading" | "join_form" | "lobby" | "match" | "kicked" | "host_gone";

interface Me {
  playerId: string;
  token: string;
  team: Team;
  number: number;
}

export default function PhoneController() {
  const { code } = useParams<{ code: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [matchStatus, setMatchStatus] = useState<MatchStatus | null>(null);
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // ── On mount: attempt to rejoin via stored token ─────────────────────────
  useEffect(() => {
    const socket = getSocket();
    const storedToken = sessionStorage.getItem(`rr-token-${code}`);
    const storedPlayerId = sessionStorage.getItem(`rr-playerId-${code}`);

    socket.on(EV.ROOM_STATE, (state: RoomState) => {
      setRoom(state);
      setPhase((prev) => {
        if (prev === "kicked" || prev === "host_gone") return prev;
        if (!state.hostConnected) return "host_gone";
        if (state.phase === "MATCH") return "match";
        if (prev !== "join_form") return "lobby";
        return prev;
      });
    });

    socket.on(EV.ROOM_CLOSED, ({ reason }: { reason: string }) => {
      setPhase(reason === "KICKED" ? "kicked" : "host_gone");
    });

    socket.on(EV.MATCH_STATUS, (status: MatchStatus) => {
      setMatchStatus(status);
      if (status.phase === "FULL_TIME") setPhase("lobby");
    });

    if (storedToken && storedPlayerId) {
      socket.emit(
        EV.PLAYER_REJOIN,
        { code, token: storedToken },
        (ack: { ok: boolean; playerId?: string; team?: Team; number?: number; error?: string }) => {
          if (ack.ok && ack.playerId && ack.team && ack.number != null) {
            setMe({ playerId: ack.playerId, token: storedToken, team: ack.team, number: ack.number });
            setPhase("lobby");
          } else {
            sessionStorage.removeItem(`rr-token-${code}`);
            sessionStorage.removeItem(`rr-playerId-${code}`);
            setPhase("join_form");
          }
        },
      );
    } else {
      setPhase("join_form");
    }

    return () => {
      socket.off(EV.ROOM_STATE);
      socket.off(EV.ROOM_CLOSED);
      socket.off(EV.MATCH_STATUS);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Join ─────────────────────────────────────────────────────────────────
  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setJoining(true);
    setJoinError(null);

    getSocket().emit(
      EV.PLAYER_JOIN,
      { code, name: trimmed },
      (ack: { ok: boolean; playerId?: string; token?: string; team?: Team; number?: number; error?: string }) => {
        setJoining(false);
        if (ack.ok && ack.playerId && ack.token && ack.team && ack.number != null) {
          sessionStorage.setItem(`rr-token-${code}`, ack.token);
          sessionStorage.setItem(`rr-playerId-${code}`, ack.playerId);
          setMe({ playerId: ack.playerId, token: ack.token, team: ack.team, number: ack.number });
          setPhase("lobby");
        } else {
          const msg: Record<string, string> = {
            ROOM_FULL: "This room is full.",
            NAME_TAKEN: "That name is already taken.",
            ROOM_NOT_FOUND: "Room not found. Check the code.",
            MATCH_IN_PROGRESS: "A match is already in progress.",
          };
          setJoinError(msg[ack.error ?? ""] ?? "Could not join. Try again.");
        }
      },
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return <Screen bg="#0F1F2E"><p className="text-gray-400">Connecting…</p></Screen>;
  }

  if (phase === "kicked") {
    return (
      <Screen bg="#0F1F2E">
        <p className="text-2xl font-bold">You were removed from the game.</p>
      </Screen>
    );
  }

  if (phase === "host_gone") {
    return (
      <Screen bg="#0F1F2E">
        <p className="text-2xl font-bold">Waiting for the host screen…</p>
        <p className="text-gray-400 text-sm mt-2">The host may have refreshed or closed the tab.</p>
      </Screen>
    );
  }

  if (phase === "join_form") {
    return (
      <Screen bg="#0F1F2E">
        <div className="w-full max-w-xs flex flex-col gap-4">
          <h1 className="text-3xl font-bold text-center">Room <span className="font-mono tracking-widest">{code}</span></h1>
          <form onSubmit={joinRoom} className="flex flex-col gap-3">
            <input
              ref={nameRef}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              placeholder="Your name"
              maxLength={16}
              className="w-full text-center text-xl py-4 rounded-2xl bg-white/10 text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-white/30"
            />
            {joinError && <p className="text-red-400 text-sm text-center">{joinError}</p>}
            <button
              type="submit"
              disabled={joining || !name.trim()}
              className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xl font-bold transition-colors"
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </form>
        </div>
      </Screen>
    );
  }

  if (phase === "match" && me) {
    return <Joystick me={me} matchStatus={matchStatus} />;
  }

  // ── Lobby view ────────────────────────────────────────────────────────────
  const bg = me ? TEAM_BG[me.team] : "#0F1F2E";
  const teamName = me?.team === "RED" ? "Red" : "Blue";
  const teammates = room?.players.filter((p) => p.id !== me?.playerId) ?? [];

  return (
    <Screen bg={bg}>
      <div className="absolute top-6 right-6 w-16 h-16 rounded-full bg-black/30 flex items-center justify-center">
        <span className="text-3xl font-bold">{me?.number}</span>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-medium opacity-70 uppercase tracking-widest">Team {teamName}</p>
        <p className="text-4xl font-bold">{room?.players.find((p) => p.id === me?.playerId)?.name ?? "…"}</p>

        {matchStatus?.phase === "FULL_TIME" ? (
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-xs opacity-60 uppercase tracking-widest">Full Time</p>
            <p className="text-4xl font-bold font-mono">
              <span style={{ color: "#ff6b6b" }}>{matchStatus.score.RED}</span>
              <span className="text-white/40 mx-2">—</span>
              <span style={{ color: "#74b9ff" }}>{matchStatus.score.BLUE}</span>
            </p>
            <p className="text-sm opacity-60 mt-2">Waiting for host to start next match…</p>
          </div>
        ) : (
          <p className="text-sm opacity-60 mt-4">Waiting for the host to kick off…</p>
        )}
      </div>

      {teammates.length > 0 && (
        <div className="mt-8 w-full max-w-xs">
          <p className="text-xs opacity-50 uppercase tracking-widest mb-2 text-center">Also in lobby</p>
          <div className="flex flex-col gap-1">
            {teammates.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: TEAM_BG[p.team] }}
                >
                  {p.number}
                </span>
                <span className="text-sm">{p.name}</span>
                {!p.connected && <span className="ml-auto text-xs opacity-40">offline</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
}

// ── Joystick controller ───────────────────────────────────────────────────────

const STICK_RADIUS = 100; // base circle radius in px
const THUMB_RADIUS = 40;  // thumb knob radius in px

function Joystick({ me, matchStatus }: { me: Me; matchStatus: MatchStatus | null }) {
  const bg = TEAM_BG[me.team];
  const inputRef = useRef({ x: 0, y: 0, kick: false });
  const stickBaseRef = useRef<{ cx: number; cy: number } | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const kickActiveRef = useRef(false);

  // Send input to server at 30 Hz
  useEffect(() => {
    const socket = getSocket();
    let lastKick = false;

    const interval = setInterval(() => {
      const { x, y, kick } = inputRef.current;
      // Always send movement; send kick only on rising edge to avoid spam
      if (x !== 0 || y !== 0 || kick !== lastKick) {
        socket.emit(EV.PLAYER_INPUT, { x, y, kick });
        lastKick = kick;
      }
    }, 33);

    return () => clearInterval(interval);
  }, []);

  // ── Joystick touch handlers ───────────────────────────────────────────────
  function onStickStart(e: React.TouchEvent<HTMLDivElement>) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    stickBaseRef.current = {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
    };
    updateThumb(touch.clientX, touch.clientY);
  }

  function onStickMove(e: React.TouchEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!stickBaseRef.current) return;
    const touch = e.changedTouches[0];
    updateThumb(touch.clientX, touch.clientY);
  }

  function onStickEnd(e: React.TouchEvent<HTMLDivElement>) {
    e.preventDefault();
    stickBaseRef.current = null;
    inputRef.current.x = 0;
    inputRef.current.y = 0;
    if (thumbRef.current) {
      thumbRef.current.style.transform = "translate(-50%, -50%)";
    }
    getSocket().emit(EV.PLAYER_INPUT, { x: 0, y: 0, kick: inputRef.current.kick });
  }

  function updateThumb(clientX: number, clientY: number) {
    const base = stickBaseRef.current;
    if (!base) return;
    let dx = clientX - base.cx;
    let dy = clientY - base.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > STICK_RADIUS) {
      dx = (dx / dist) * STICK_RADIUS;
      dy = (dy / dist) * STICK_RADIUS;
    }
    inputRef.current.x = parseFloat((dx / STICK_RADIUS).toFixed(3));
    inputRef.current.y = parseFloat((dy / STICK_RADIUS).toFixed(3));
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }

  // ── Kick touch handlers ───────────────────────────────────────────────────
  function onKickStart(e: React.TouchEvent<HTMLButtonElement>) {
    e.preventDefault();
    kickActiveRef.current = true;
    inputRef.current.kick = true;
    getSocket().emit(EV.PLAYER_INPUT, { ...inputRef.current, kick: true });
  }

  function onKickEnd(e: React.TouchEvent<HTMLButtonElement>) {
    e.preventDefault();
    kickActiveRef.current = false;
    inputRef.current.kick = false;
  }

  return (
    <div
      className="fixed inset-0 flex select-none overflow-hidden"
      style={{ backgroundColor: bg, touchAction: "none" }}
    >
      {/* HUD — score + timer */}
      {matchStatus && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 bg-black/40">
          <span className="text-sm font-bold opacity-70 uppercase tracking-widest">
            {me.team === "RED" ? "Red" : "Blue"} #{me.number}
          </span>
          <span className="text-xl font-bold font-mono">
            <span style={{ color: "#ff6b6b" }}>{matchStatus.score.RED}</span>
            <span className="text-white/50 mx-2">—</span>
            <span style={{ color: "#74b9ff" }}>{matchStatus.score.BLUE}</span>
          </span>
          <span className="text-sm font-mono font-bold opacity-80">
            {formatTime(matchStatus.timeLeftMs)}
          </span>
        </div>
      )}

      {/* GOAL flash */}
      {matchStatus?.phase === "GOAL" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-5xl font-black tracking-widest drop-shadow-lg animate-pulse">
            GOAL!
          </span>
        </div>
      )}

      {/* Team label (no HUD yet) */}
      {!matchStatus && (
        <div className="absolute top-4 left-4 opacity-60 text-sm font-bold uppercase tracking-widest">
          {me.team === "RED" ? "Red" : "Blue"} #{me.number}
        </div>
      )}

      {/* Joystick zone — left side */}
      <div
        className="flex-1 flex items-center justify-center"
        onTouchStart={onStickStart}
        onTouchMove={onStickMove}
        onTouchEnd={onStickEnd}
        onTouchCancel={onStickEnd}
      >
        {/* Base ring */}
        <div
          className="relative rounded-full border-4 border-white/30"
          style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
        >
          {/* Thumb knob */}
          <div
            ref={thumbRef}
            className="absolute top-1/2 left-1/2 rounded-full bg-white/80"
            style={{
              width: THUMB_RADIUS * 2,
              height: THUMB_RADIUS * 2,
              transform: "translate(-50%, -50%)",
              transition: "transform 0.05s ease-out",
            }}
          />
        </div>
      </div>

      {/* Kick button — right side */}
      <div className="flex items-center justify-center pr-10">
        <button
          onTouchStart={onKickStart}
          onTouchEnd={onKickEnd}
          onTouchCancel={onKickEnd}
          className="w-28 h-28 rounded-full bg-white/20 border-4 border-white/50 text-white text-xl font-bold active:bg-white/40 active:scale-95 transition-all"
          style={{ touchAction: "none" }}
        >
          KICK
        </button>
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function Screen({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center p-6 text-white"
      style={{ backgroundColor: bg }}
    >
      {children}
    </div>
  );
}
