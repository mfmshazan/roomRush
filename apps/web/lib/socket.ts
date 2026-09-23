import { io, type Socket } from "socket.io-client";

const url = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:3001";

// Single socket instance shared across the app.
// Only created on the client; safe to import from client components.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(url, { autoConnect: true });
  }
  return socket;
}
