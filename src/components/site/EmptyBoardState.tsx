export function EmptyBoardState({ noun }: { noun: string }) {
  return (
    <div
      className="border-dashed p-12 text-center shadow-lg shadow-black/30 backdrop-blur-md"
      style={{
        borderRadius: "var(--card-radius, 12px)",
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.3))",
        border: "1px dashed rgba(255,255,255,calc(var(--card-border-opacity, 0.15) + 0.1))",
      }}
    >
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
