"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "react-qr-code";
import { getSocket } from "../../../lib/socket";
import { EV } from "@roomrush/shared";
import type { RoomState, LobbyPlayer, Team } from "@roomrush/shared";

const TEAM_COLOUR = { RED: "#D7263D", BLUE: "#1B66D1" } as const;

export default function HostLobby() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [durationSec, setDurationSec] = useState(180);
  const [goalsToWin, setGoalsToWin] = useState(3);
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/play/${code}`);
    const socket = getSocket();

    socket.on(EV.ROOM_STATE, (state: RoomState) => setRoom(state));

    // Request current state on mount (handles host page refresh).
    socket.emit(EV.HOST_CREATE_ROOM, {}, (ack: { ok: boolean; code?: string }) => {
      // If the room already exists the server won't create a duplicate —
      // this ack fires but the real state comes via ROOM_STATE broadcasts.
      // If the socket is fresh (e.g. after a refresh), we need to re-host.
      // For now, a refresh loses the room; future M4 work handles host resume.
      void ack;
    });

    return () => { socket.off(EV.ROOM_STATE); };
  }, [code]);

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

  const redPlayers = room?.players.filter((p) => p.team === "RED") ?? [];
  const bluePlayers = room?.players.filter((p) => p.team === "BLUE") ?? [];
  const totalPlayers = room?.players.length ?? 0;

  return (
    <div className="min-h-screen bg-[#0F1F2E] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <span className="text-gray-400 text-sm">
          {room?.hostConnected === false ? "⚠️ Host disconnected" : `${totalPlayers} player${totalPlayers !== 1 ? "s" : ""} in lobby`}
        </span>
        <span className="text-gray-400 text-sm">RoomRush</span>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row gap-6 p-6">
        {/* Left: code + QR */}
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

        {/* Centre: team columns */}
        <div className="flex flex-1 gap-4">
          <TeamColumn
            team="RED"
            players={redPlayers}
            onSwap={swapTeam}
            onKick={kickPlayer}
          />
          <TeamColumn
            team="BLUE"
            players={bluePlayers}
            onSwap={swapTeam}
            onKick={kickPlayer}
          />
        </div>

        {/* Right: settings + kick off */}
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

function TeamColumn({
  team,
  players,
  onSwap,
  onKick,
}: {
  team: Team;
  players: LobbyPlayer[];
  onSwap: (p: LobbyPlayer) => void;
  onKick: (p: LobbyPlayer) => void;
}) {
  const colour = TEAM_COLOUR[team];
  const label = team === "RED" ? "Red" : "Blue";

  return (
    <div className="flex-1 flex flex-col gap-2">
      <h2
        className="text-center font-bold text-lg py-2 rounded-xl"
        style={{ backgroundColor: colour + "33", color: colour }}
      >
        {label}
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
          {!player.connected && (
            <span className="text-gray-500 text-xs">offline</span>
          )}
          <button
            onClick={() => onSwap(player)}
            title="Swap team"
            className="text-gray-400 hover:text-white text-xs px-1"
          >
            ⇄
          </button>
          <button
            onClick={() => onKick(player)}
            title="Kick player"
            className="text-gray-500 hover:text-red-400 text-xs px-1"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
