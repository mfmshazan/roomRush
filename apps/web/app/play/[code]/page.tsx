"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSocket } from "../../../lib/socket";
import { EV } from "@roomrush/shared";
import type { RoomState, Team } from "@roomrush/shared";

const TEAM_BG = { RED: "#D7263D", BLUE: "#1B66D1" } as const;

type Phase = "loading" | "join_form" | "lobby" | "kicked" | "host_gone";

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
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // ── On mount: attempt to rejoin via stored token ─────────────────────────
  useEffect(() => {
    const socket = getSocket();
    const storedToken = localStorage.getItem(`rr-token-${code}`);
    const storedPlayerId = localStorage.getItem(`rr-playerId-${code}`);

    socket.on(EV.ROOM_STATE, (state: RoomState) => {
      setRoom(state);
      // Use functional form to avoid stale closure; never overwrite terminal states.
      setPhase((prev) => {
        if (prev === "kicked" || prev === "host_gone") return prev;
        if (!state.hostConnected) return "host_gone";
        if (prev !== "join_form") return "lobby";
        return prev;
      });
    });

    socket.on(EV.ROOM_CLOSED, ({ reason }: { reason: string }) => {
      setPhase(reason === "KICKED" ? "kicked" : "host_gone");
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
            // Token stale — clear storage and show join form
            localStorage.removeItem(`rr-token-${code}`);
            localStorage.removeItem(`rr-playerId-${code}`);
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
          localStorage.setItem(`rr-token-${code}`, ack.token);
          localStorage.setItem(`rr-playerId-${code}`, ack.playerId);
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

  // ── Lobby view ────────────────────────────────────────────────────────────
  const bg = me ? TEAM_BG[me.team] : "#0F1F2E";
  const teamName = me?.team === "RED" ? "Red" : "Blue";
  const teammates = room?.players.filter((p) => p.id !== me?.playerId) ?? [];

  return (
    <Screen bg={bg}>
      {/* Player number badge */}
      <div className="absolute top-6 right-6 w-16 h-16 rounded-full bg-black/30 flex items-center justify-center">
        <span className="text-3xl font-bold">{me?.number}</span>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-medium opacity-70 uppercase tracking-widest">Team {teamName}</p>
        <p className="text-4xl font-bold">{room?.players.find((p) => p.id === me?.playerId)?.name ?? "…"}</p>
        <p className="text-sm opacity-60 mt-4">Waiting for the host to kick off…</p>
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
