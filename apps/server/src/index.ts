import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { EV, PROTOCOL_VERSION } from "@roomrush/shared";
import { RoomManager } from "./rooms.js";
import { registerHostHandlers } from "./handlers/host.js";
import { registerPlayerHandlers } from "./handlers/player.js";

const PORT = Number(process.env["PORT"] ?? 3001);
// Comma-separated list of allowed origins — supports both localhost and LAN IP
const CLIENT_ORIGINS = (process.env["CLIENT_ORIGIN"] ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, version: PROTOCOL_VERSION });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGINS } });

const rooms = new RoomManager();

// Notify all remaining sockets when a room is force-closed (e.g. idle cleanup).
rooms.setCloseCallback((_code, socketIds) => {
  for (const id of socketIds) {
    io.to(id).emit(EV.ROOM_CLOSED, { reason: "ROOM_CLOSED" });
  }
});

// Purge stale rooms every minute.
setInterval(() => rooms.cleanup(), 60_000);

io.on("connection", (socket) => {
  registerHostHandlers(io, socket, rooms);
  registerPlayerHandlers(io, socket, rooms);
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}  (protocol ${PROTOCOL_VERSION})`);
});
