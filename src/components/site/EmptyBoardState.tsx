export function EmptyBoardState({ noun }: { noun: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/20 bg-black/20 p-12 text-center">
      <p className="text-white/60">No {noun} yet</p>
      <button
        type="button"
        disabled
        title="Coming in a later phase"
        className="mt-4 rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black opacity-60"
      >
        + New {noun.replace(/s$/, "")}
      </button>
    </div>
  );
}
