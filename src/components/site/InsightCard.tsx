import type { ArtistInsight } from "@/lib/database.types";

export function InsightCard({ insight }: { insight: ArtistInsight }) {
  return (
    <div
      className="p-4 shadow-lg shadow-black/30 backdrop-blur-md transition-[transform,filter] duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 hover:brightness-110"
      style={{
        borderRadius: "var(--card-radius, 12px)",
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
      }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--card-text-color, #fff)" }}>
        {insight.headline}
      </p>
      <p className="mt-1 text-xs leading-relaxed opacity-70" style={{ color: "var(--card-text-color, #fff)" }}>
        {insight.detail}
      </p>
      <p
        className="mt-2 text-[10px] uppercase tracking-wide opacity-40"
        style={{ color: "var(--card-text-color, #fff)" }}
      >
        Based on: {insight.basis}
      </p>
    </div>
  );
}
