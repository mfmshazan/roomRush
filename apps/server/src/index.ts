import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { PROTOCOL_VERSION } from "@roomrush/shared";

const PORT = Number(process.env["PORT"] ?? 3001);
const CLIENT_ORIGIN = process.env["CLIENT_ORIGIN"] ?? "http://localhost:3000";

const app = express();

app.use(cors({ origin: CLIENT_ORIGIN }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, version: PROTOCOL_VERSION });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

io.on("connection", (socket) => {
  console.log(`[socket] connected  ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[socket] disconnected ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}  (protocol ${PROTOCOL_VERSION})`);
});
