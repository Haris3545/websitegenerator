export function KpiCard({
  label,
  value,
  caption,
  color = "var(--primary)",
}: {
  label: string;
  value: string;
  caption: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-white/15 bg-black/40 p-4 shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:border-white/25">
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-white/40">{caption}</p>
    </div>
  );
}
