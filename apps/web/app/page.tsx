"use client";

import { useEffect, useState } from "react";
import { getSocket } from "../lib/socket";
import { PROTOCOL_VERSION } from "@roomrush/shared";

export default function Home() {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (socket.connected) setStatus("connected");

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const colours = {
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    disconnected: "bg-red-500",
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">RoomRush</h1>
      <div className="flex items-center gap-3">
        <span className={`h-4 w-4 rounded-full ${colours[status]}`} />
        <span className="text-xl capitalize">{status}</span>
      </div>
      <p className="text-sm text-gray-500">Protocol v{PROTOCOL_VERSION}</p>
    </main>
  );
}
