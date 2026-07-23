export function PlaceholderSection({ title, note }: { title: string; note: string }) {
  return (
    <div
      className="p-8 shadow-lg shadow-black/30 backdrop-blur-md"
      style={{
        borderRadius: "var(--card-radius, 12px)",
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.3))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
      }}
    >
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-white/50">{note}</p>
    </div>
  );
}
