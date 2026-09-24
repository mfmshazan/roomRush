"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "react-qr-code";
import { getSocket } from "../../../lib/socket";
import { EV } from "@roomrush/shared";
import type { RoomState, LobbyPlayer, Team } from "@roomrush/shared";
import { initMatch } from "../../../game/rules";
import { startLoop } from "../../../game/loop";
import { useKeyboardInput } from "../../../game/input";
import type { PlayerInput } from "../../../game/input";
import type { MatchState } from "../../../game/types";

const TEAM_COLOUR = { RED: "#D7263D", BLUE: "#1B66D1" } as const;
const MATCH_DURATION_MS = 3 * 60 * 1000;

export default function HostPage() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [durationSec, setDurationSec] = useState(180);
  const [goalsToWin, setGoalsToWin] = useState(3);
  const [joinUrl, setJoinUrl] = useState("");
  const [finalState, setFinalState] = useState<MatchState | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const matchStateRef = useRef<MatchState | null>(null);
  const getKeyboardInput = useKeyboardInput();
  const phoneInputRef = useRef<Map<string, PlayerInput>>(new Map());
  // Real player IDs for the two keyboard slots (set at match start)
  const kbPlayerIdsRef = useRef<[string | null, string | null]>([null, null]);

  // Merged input: phone inputs by real ID; keyboard remapped from kb0/kb1 to real IDs
  const getInput = useCallback((): Map<string, PlayerInput> => {
    const merged = new Map<string, PlayerInput>(phoneInputRef.current);
    const kbMap = getKeyboardInput();
    const kb0 = kbMap.get("kb0");
    const kb1 = kbMap.get("kb1");
    if (kb0 && kbPlayerIdsRef.current[0]) merged.set(kbPlayerIdsRef.current[0], kb0);
    if (kb1 && kbPlayerIdsRef.current[1]) merged.set(kbPlayerIdsRef.current[1], kb1);
    return merged;
  }, [getKeyboardInput]);

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/play/${code}`);
    const socket = getSocket();

    socket.on(EV.ROOM_STATE, (state: RoomState) => setRoom(state));
    socket.on(EV.PLAYER_INPUT, (data: { playerId: string } & PlayerInput) => {
      const { playerId, ...inp } = data;
      phoneInputRef.current.set(playerId, inp);
    });
    socket.emit(EV.HOST_CREATE_ROOM, {}, () => {});

    return () => {
      socket.off(EV.ROOM_STATE);
      socket.off(EV.PLAYER_INPUT);
    };
  }, [code]);

  // ── Game loop: start when phase flips to MATCH ────────────────────────────
  useEffect(() => {
    if (room?.phase !== "MATCH") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const now = performance.now();
    const state = initMatch(room.players, now);

    kbPlayerIdsRef.current = [
      state.players[0]?.id ?? null,
      state.players[1]?.id ?? null,
    ];
    phoneInputRef.current.clear();
    matchStateRef.current = state;

    const socket = getSocket();

    const stop = startLoop(
      canvas,
      state,
      getInput,
      (finalS) => {
        setFinalState({ ...finalS });
        socket.emit(EV.HOST_MATCH_STATUS, {
          phase: "FULL_TIME",
          score: finalS.score,
          timeLeftMs: 0,
        });
      },
      durationSec * 1000,
    );

    // Broadcast live score + timer to phones every second
    const statusInterval = setInterval(() => {
      const s = matchStateRef.current;
      if (!s || s.phase === "FULL_TIME") return;
      const lastGoal = s.goals[s.goals.length - 1];
      socket.emit(EV.HOST_MATCH_STATUS, {
        phase: s.phase,
        score: s.score,
        timeLeftMs: s.timeLeftMs,
        ...(lastGoal ? { lastGoal: { team: lastGoal.team, scorerName: lastGoal.scorerName, ownGoal: lastGoal.ownGoal } } : {}),
      });
    }, 1000);

    return () => {
      stop();
      clearInterval(statusInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase]);

  // ── Lobby actions ─────────────────────────────────────────────────────────
  function swapTeam(player: LobbyPlayer) {
    const newTeam: Team = player.team === "RED" ? "BLUE" : "RED";
    getSocket().emit(EV.HOST_SET_TEAM, { playerId: player.id, team: newTeam });
  }

  function kickPlayer(player: LobbyPlayer) {
    getSocket().emit(EV.HOST_KICK_PLAYER, { playerId: player.id });
  }

  function kickOff() {
    getSocket().emit(EV.HOST_START_MATCH, { durationSec, goalsToWin });
  }

  // ── Full-time results overlay ──────────────────────────────────────────────
  if (finalState) {
    return (
      <FullTimeScreen
        state={finalState}
        onPlayAgain={() => {
          setFinalState(null);
          matchStateRef.current = null;
          getSocket().emit(EV.HOST_PLAY_AGAIN, {});
        }}
      />
    );
  }

  // ── Match: full-screen canvas ─────────────────────────────────────────────
  if (room?.phase === "MATCH") {
    return (
      <div className="w-screen h-screen bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
        />
        <div className="absolute bottom-3 right-3 text-xs text-white/30 pointer-events-none">
          WASD + Space &nbsp;|&nbsp; Arrows + Enter
        </div>
      </div>
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  const redPlayers = room?.players.filter((p) => p.team === "RED") ?? [];
  const bluePlayers = room?.players.filter((p) => p.team === "BLUE") ?? [];
  const totalPlayers = room?.players.length ?? 0;

  return (
    <div className="min-h-screen bg-[#0F1F2E] text-white flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <span className="text-gray-400 text-sm">
          {room?.hostConnected === false
            ? "⚠️ Host disconnected"
            : `${totalPlayers} player${totalPlayers !== 1 ? "s" : ""} in lobby`}
        </span>
        <span className="text-gray-400 text-sm">RoomRush</span>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row gap-6 p-6">
        {/* Code + QR */}
        <div className="flex flex-col items-center gap-4 lg:w-72 shrink-0">
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-1">Join at</p>
            <p className="text-gray-300 text-xs mb-3 break-all">{joinUrl}</p>
            <p className="font-mono text-7xl font-bold tracking-widest text-white leading-none">
              {code}
            </p>
          </div>
          {joinUrl && (
            <div className="bg-white p-3 rounded-xl">
              <QRCode value={joinUrl} size={160} />
            </div>
          )}
        </div>

        {/* Teams */}
        <div className="flex flex-1 gap-4">
          <TeamColumn team="RED" players={redPlayers} onSwap={swapTeam} onKick={kickPlayer} />
          <TeamColumn team="BLUE" players={bluePlayers} onSwap={swapTeam} onKick={kickPlayer} />
        </div>

        {/* Settings + kick off */}
        <div className="flex flex-col gap-4 lg:w-56 shrink-0">
          <div className="bg-white/5 rounded-2xl p-4 flex flex-col gap-3">
            <h2 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Settings</h2>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-300">Duration</span>
              <select
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="bg-white/10 rounded-lg px-3 py-2 text-white"
              >
                <option value={180}>3 minutes</option>
                <option value={300}>5 minutes</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-300">Goals to win</span>
              <select
                value={goalsToWin}
                onChange={(e) => setGoalsToWin(Number(e.target.value))}
                className="bg-white/10 rounded-lg px-3 py-2 text-white"
              >
                <option value={3}>First to 3</option>
                <option value={5}>First to 5</option>
              </select>
            </label>
          </div>

          <button
            onClick={kickOff}
            disabled={totalPlayers < 2}
            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xl font-bold transition-colors"
          >
            Kick off ⚽
          </button>
          {totalPlayers < 2 && (
            <p className="text-center text-gray-500 text-xs">Need at least 2 players</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Team column (same as before) ─────────────────────────────────────────────

function TeamColumn({
  team, players, onSwap, onKick,
}: {
  team: Team;
  players: LobbyPlayer[];
  onSwap: (p: LobbyPlayer) => void;
  onKick: (p: LobbyPlayer) => void;
}) {
  const colour = TEAM_COLOUR[team];
  return (
    <div className="flex-1 flex flex-col gap-2">
      <h2
        className="text-center font-bold text-lg py-2 rounded-xl"
        style={{ backgroundColor: colour + "33", color: colour }}
      >
        {team === "RED" ? "Red" : "Blue"}
      </h2>
      {players.length === 0 && (
        <p className="text-center text-gray-600 text-sm mt-4">No players yet</p>
      )}
      {players.map((player) => (
        <div
          key={player.id}
          className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/5"
          style={{ opacity: player.connected ? 1 : 0.45 }}
        >
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ backgroundColor: colour }}
          >
            {player.number}
          </span>
          <span className="flex-1 text-sm font-medium truncate">{player.name}</span>
          {!player.connected && <span className="text-gray-500 text-xs">offline</span>}
          <button onClick={() => onSwap(player)} title="Swap team" className="text-gray-400 hover:text-white text-xs px-1">⇄</button>
          <button onClick={() => onKick(player)} title="Kick player" className="text-gray-500 hover:text-red-400 text-xs px-1">✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Full-time screen ──────────────────────────────────────────────────────────

function FullTimeScreen({
  state,
  onPlayAgain,
}: {
  state: MatchState;
  onPlayAgain: () => void;
}) {
  const winner =
    state.score.RED > state.score.BLUE ? "RED"
    : state.score.BLUE > state.score.RED ? "BLUE"
    : null;

  return (
    <div className="min-h-screen bg-[#0F1F2E] text-white flex flex-col items-center justify-center gap-8">
      <h1 className="text-4xl font-bold">Full Time</h1>

      <div className="flex items-center gap-6 text-6xl font-bold">
        <span style={{ color: TEAM_COLOUR.RED }}>{state.score.RED}</span>
        <span className="text-gray-500">—</span>
        <span style={{ color: TEAM_COLOUR.BLUE }}>{state.score.BLUE}</span>
      </div>

      {winner && (
        <p className="text-2xl" style={{ color: TEAM_COLOUR[winner] }}>
          {winner} wins!
        </p>
      )}
      {!winner && <p className="text-2xl text-gray-400">Draw!</p>}

      {state.goals.length > 0 && (
        <div className="flex flex-col gap-1 text-sm text-gray-300">
          {state.goals.map((g, i) => (
            <p key={i}>
              <span style={{ color: TEAM_COLOUR[g.team] }}>
                {g.scorerName ?? "Unknown"}
              </span>
              {g.ownGoal ? " (OG)" : ""}
            </p>
          ))}
        </div>
      )}

      <button
        onClick={onPlayAgain}
        className="px-8 py-4 rounded-2xl bg-green-600 hover:bg-green-500 text-white text-xl font-bold transition-colors"
      >
        Play again
      </button>
    </div>
  );
}
