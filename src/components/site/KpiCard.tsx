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
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-white/40">{caption}</p>
    </div>
  );
}
