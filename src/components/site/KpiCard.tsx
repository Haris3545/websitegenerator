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
    <div
      className="p-4 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_28px_var(--accent)]"
      style={{
        borderRadius: "var(--card-radius, 12px)",
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
      }}
    >
      <p
        className="text-xs uppercase tracking-wide opacity-60"
        style={{ color: "var(--card-text-color, #fff)" }}
      >
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-xs opacity-50" style={{ color: "var(--card-text-color, #fff)" }}>
        {caption}
      </p>
    </div>
  );
}
