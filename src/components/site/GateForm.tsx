"use client";

import { useState, useTransition } from "react";
import { verifyArtistAccess } from "@/app/s/[slug]/actions";

export function GateForm({ slug }: { slug: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyArtistAccess(slug, password);
      if (!result.ok) setError("That password isn't right — check with whoever shared this dashboard with you.");
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-white/15 bg-black/40 p-8 shadow-lg backdrop-blur-md"
      >
        <h1 className="mb-1 text-xl font-semibold">Enter password</h1>
        <p className="mb-6 text-sm text-white/50">
          Ask whoever shared this dashboard link with you for the password.
        </p>
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-white/20 bg-black/30 px-3 py-2 text-sm"
          placeholder="Password"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="mt-4 w-full rounded bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {isPending ? "Checking..." : "View dashboard"}
        </button>
      </form>
    </div>
  );
}
