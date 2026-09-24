"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PlayEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 4) router.push(`/play/${trimmed}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">Join a game</h1>
      <form onSubmit={submit} className="flex flex-col gap-4 w-full max-w-xs">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
          placeholder="ROOM CODE"
          className="w-full text-center font-mono text-3xl tracking-widest py-4 rounded-2xl bg-white/10 text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-white/30"
          maxLength={4}
        />
        <button
          type="submit"
          disabled={code.trim().length !== 4}
          className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xl font-bold transition-colors"
        >
          Join
        </button>
      </form>
    </main>
  );
}
