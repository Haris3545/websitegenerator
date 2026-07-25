"use client";

import { useState, useTransition } from "react";
import { deleteArtist } from "@/app/builder/actions";

export function DeleteArtistButton({ artistId, artistName }: { artistId: string; artistName: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (
      !window.confirm(
        `Delete "${artistName}" for good? This removes its dashboard, all cached data, and (if published) its standalone site. This can't be undone.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteArtist(artistId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleDelete}
        className="text-xs font-medium text-red-400 hover:underline disabled:opacity-50"
      >
        {isPending ? "Deleting..." : "Delete"}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}
