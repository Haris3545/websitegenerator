"use client";

import { useState, useTransition } from "react";
import { verifyArtistAccess } from "@/app/s/[slug]/actions";

export function GateForm({
  slug,
  backgroundUrl,
  backgroundColor,
}: {
  slug: string;
  backgroundUrl: string | null;
  backgroundColor: string;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(backgroundUrl ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyArtistAccess(slug, password);
      if (!result.ok) {
        setError(
          result.error ??
            "That password isn't right — check with whoever shared this dashboard with you."
        );
      }
    });
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 text-white"
      style={{ backgroundColor }}
    >
      {backgroundUrl &&
        (isVideo ? (
          <video
            src={backgroundUrl}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ))}
      {backgroundUrl && <div className="absolute inset-0 bg-black/60" />}

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-xl border border-white/15 bg-black/40 p-8 shadow-lg backdrop-blur-md"
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
