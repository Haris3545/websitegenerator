export function EmptyBoardState({ noun }: { noun: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/25 bg-black/30 p-12 text-center shadow-lg shadow-black/30 backdrop-blur-md">
      <p className="text-white/60">No {noun} yet</p>
      <button
        type="button"
        disabled
        title="Coming in a later phase"
        className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black opacity-60"
      >
        + New {noun.replace(/s$/, "")}
      </button>
    </div>
  );
}
