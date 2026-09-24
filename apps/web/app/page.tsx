"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "../lib/socket";
import { EV } from "@roomrush/shared";

export default function Home() {
  const router = useRouter();
  const [hosting, setHosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function hostGame() {
    setHosting(true);
    setError(null);
    const socket = getSocket();

    socket.emit(EV.HOST_CREATE_ROOM, {}, (ack: { ok: boolean; code?: string; error?: string }) => {
      if (ack.ok && ack.code) {
        router.push(`/host/${ack.code}`);
      } else {
        setError("Could not create room. Is the server running?");
        setHosting(false);
      }
    });

    // If socket not yet connected, connect first then the ack will fire.
    if (!socket.connected) socket.connect();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-6xl font-bold tracking-tight mb-2">RoomRush</h1>
        <p className="text-gray-400 text-lg">Party football in your browser</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={hostGame}
          disabled={hosting}
          className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-50 text-white text-xl font-bold transition-colors"
        >
          {hosting ? "Creating room…" : "Host a game"}
        </button>

        <button
          onClick={() => router.push("/play")}
          className="w-full py-4 rounded-2xl bg-gray-800 hover:bg-gray-700 active:bg-gray-900 text-white text-xl font-bold transition-colors"
        >
          Join a game
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
    </main>
  );
}
