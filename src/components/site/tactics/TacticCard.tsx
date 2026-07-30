"use client";

import { useState } from "react";
import { useTriggerPoof } from "@/hooks/usePoofEffect";
import { TACTIC_PILLARS, TACTIC_STATUSES } from "@/lib/tacticFields";
import type { BoardItem } from "@/lib/database.types";

const cardStyle = {
  borderRadius: "var(--card-radius, 12px)",
  backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
  border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
} as const;

const textStyle = { color: "var(--card-text-color, #fff)" } as const;

const STATUS_DOT: Record<string, string> = {
  planned: "#9ca3af",
  approved: "#3b82f6",
  booked: "#22c55e",
  archived: "#6b7280",
};

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M4 6h16M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6m2 0-.7 13.1A2 2 0 0 1 14.3 21H9.7a2 2 0 0 1-2-1.9L7 6"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-40" style={textStyle}>
        {label}
      </p>
      <p className="text-xs opacity-80" style={textStyle}>
        {value}
      </p>
    </div>
  );
}

export function TacticCard({
  item,
  onEdit,
  onDelete,
  justAdded,
}: {
  item: BoardItem;
  onEdit: () => void;
  onDelete: () => void;
  justAdded?: boolean;
}) {
  const triggerPoof = useTriggerPoof();
  const [removing, setRemoving] = useState(false);
  const statusLabel = TACTIC_STATUSES.find((s) => s.value === item.tactic_status)?.label;
  const pillarLabel = TACTIC_PILLARS.find((p) => p.value === item.pillar)?.label;
  const campaignRange =
    item.campaign_start_date && item.campaign_end_date
      ? `${formatDate(item.campaign_start_date)} – ${formatDate(item.campaign_end_date)}`
      : item.campaign_start_date
        ? `From ${formatDate(item.campaign_start_date)}`
        : null;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    triggerPoof(e.clientX, e.clientY);
    setRemoving(true);
    window.setTimeout(onDelete, 160);
  }

  return (
    <div
      className={`overflow-hidden shadow-lg shadow-black/30 backdrop-blur-md transition-[transform,filter] duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 hover:brightness-110 ${
        removing ? "animate-poof" : justAdded ? "animate-poof-in" : ""
      }`}
      style={cardStyle}
    >
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="h-32 w-full object-cover" />
      )}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.channel && (
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
                {item.channel}
              </span>
            )}
            {pillarLabel && (
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
                {pillarLabel}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit tactic"
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <EditIcon />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete tactic"
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-red-500/80 hover:text-white"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold" style={textStyle}>
            {item.title}
          </h3>
          {statusLabel && (
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide opacity-70" style={textStyle}>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: STATUS_DOT[item.tactic_status ?? ""] ?? "#9ca3af" }}
              />
              {statusLabel}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Field label="Objective" value={item.objective} />
          <Field label="Optimised KPI" value={item.kpi} />
          <Field label="Role in the mix" value={item.role_in_mix} />
          <Field label="Format" value={item.format} />
          <Field label="Phase" value={item.phase} />
          <Field label="Budget" value={item.budget} />
        </div>

        {item.audience.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.audience.map((a) => (
              <span
                key={a}
                className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
              >
                {a}
              </span>
            ))}
          </div>
        )}
        <Field label="Audience detail" value={item.audience_detail} />
        {campaignRange && <Field label="Campaign dates" value={campaignRange} />}

        {item.body && (
          <p className="text-sm opacity-70" style={textStyle}>
            {item.body}
          </p>
        )}
      </div>
    </div>
  );
}
