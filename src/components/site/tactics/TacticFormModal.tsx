"use client";

import { useRef, useState, useTransition } from "react";
import imageCompression from "browser-image-compression";
import { addTacticCard, updateTacticCard } from "@/app/s/[slug]/actions";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { PasteImageField } from "@/components/site/PasteImageField";
import { CampaignDateRangeField } from "@/components/site/tactics/CampaignDateRangeField";
import { TACTIC_AUDIENCE_PRESETS, TACTIC_CHANNELS, TACTIC_PILLARS, TACTIC_STATUSES } from "@/lib/tacticFields";
import type { BoardItem } from "@/lib/database.types";

const IMAGE_MAX_DIMENSION = 1600;

const fieldClass =
  "rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white transition-colors focus:border-[var(--accent)] focus:bg-white/[0.07] focus:outline-none [color-scheme:dark]";
const labelClass = "text-xs font-medium uppercase tracking-wide text-white/45";

function ChipToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-[var(--accent)] text-black" : "border border-white/15 text-white/60 hover:border-white/30"
      }`}
    >
      {label}
    </button>
  );
}

/** The Tactics tab's add/edit form — one component handles both (isEdit =
 * !!item), same shape as IdeaFormModal.tsx. Considerably more fields than
 * any other board's form since Tactics is the one board that needs to
 * capture real campaign-planning detail (channel, pillar, status, KPIs,
 * audience, dates, budget...) rather than just a title+note. */
export function TacticFormModal({
  artistId,
  slug,
  item,
  onClose,
  onSaved,
}: {
  artistId: string;
  slug: string;
  item?: BoardItem;
  onClose: () => void;
  onSaved: (item: BoardItem) => void;
}) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title ?? "");
  const [channel, setChannel] = useState(item?.channel ?? "");
  const [pillar, setPillar] = useState(item?.pillar ?? "");
  const [tacticStatus, setTacticStatus] = useState(item?.tactic_status ?? "planned");
  const [objective, setObjective] = useState(item?.objective ?? "");
  const [kpi, setKpi] = useState(item?.kpi ?? "");
  const [roleInMix, setRoleInMix] = useState(item?.role_in_mix ?? "");
  const [audience, setAudience] = useState<string[]>(item?.audience ?? []);
  const [customAudience, setCustomAudience] = useState("");
  const [audienceDetail, setAudienceDetail] = useState(item?.audience_detail ?? "");
  const [format, setFormat] = useState(item?.format ?? "");
  const [phase, setPhase] = useState(item?.phase ?? "");
  const [budget, setBudget] = useState(item?.budget ?? "");
  const [campaignStart, setCampaignStart] = useState(item?.campaign_start_date ?? null);
  const [campaignEnd, setCampaignEnd] = useState(item?.campaign_end_date ?? null);
  const [body, setBody] = useState(item?.body ?? "");
  const [preview, setPreview] = useState<string | null>(item?.image_url ?? null);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<File | null>(null);
  const { closing, requestClose } = useClosableOverlay(onClose);

  const extraAudiencePresets = TACTIC_AUDIENCE_PRESETS.filter((p) => !audience.includes(p));
  const customTagsAlreadyAdded = audience.filter((a) => !TACTIC_AUDIENCE_PRESETS.includes(a));

  function toggleAudience(value: string) {
    setAudience((prev) => (prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]));
  }

  function addCustomAudience() {
    const trimmed = customAudience.trim();
    if (!trimmed || audience.includes(trimmed)) return;
    setAudience((prev) => [...prev, trimmed]);
    setCustomAudience("");
  }

  async function handleFileChange(file: File) {
    setError(null);
    setCompressing(true);
    try {
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: IMAGE_MAX_DIMENSION,
        maxSizeMB: 1,
        useWebWorker: true,
        fileType: file.type === "image/png" ? "image/png" : "image/webp",
      });
      fileRef.current = compressed;
      setPreview(URL.createObjectURL(compressed));
    } catch {
      setError("Couldn't process that image — try a different file.");
    } finally {
      setCompressing(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the tactic a title.");
      return;
    }
    if (!channel) {
      setError("Choose a channel.");
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("channel", channel);
    formData.set("pillar", pillar);
    formData.set("tactic_status", tacticStatus);
    formData.set("objective", objective.trim());
    formData.set("kpi", kpi.trim());
    formData.set("role_in_mix", roleInMix.trim());
    formData.set("audience", audience.join("|"));
    formData.set("audience_detail", audienceDetail.trim());
    formData.set("format", format.trim());
    formData.set("phase", phase.trim());
    formData.set("budget", budget.trim());
    formData.set("campaign_start_date", campaignStart ?? "");
    formData.set("campaign_end_date", campaignEnd ?? "");
    formData.set("body", body.trim());
    if (fileRef.current) formData.set("image", fileRef.current);

    startTransition(async () => {
      const result = isEdit
        ? await updateTacticCard(item!.id, slug, formData)
        : await addTacticCard(artistId, slug, formData);
      if (result.ok) {
        onSaved(result.item);
        requestClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={requestClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 text-white shadow-2xl shadow-black/50 ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <p className="text-base font-semibold">{isEdit ? "Edit tactic" : "New tactic"}</p>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="custom-scrollbar flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Image</span>
            <PasteImageField preview={preview} compressing={compressing} onFile={handleFileChange} />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Title *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={fieldClass}
              placeholder="e.g. Instagram Reels teaser burst"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Channel *</span>
            <div className="flex flex-wrap gap-1.5">
              {TACTIC_CHANNELS.map((c) => (
                <ChipToggle key={c} label={c} active={channel === c} onClick={() => setChannel(c)} />
              ))}
            </div>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Pillar</span>
            <div className="flex flex-wrap gap-1.5">
              {TACTIC_PILLARS.map((p) => (
                <ChipToggle
                  key={p.value}
                  label={p.label}
                  active={pillar === p.value}
                  onClick={() => setPillar(pillar === p.value ? "" : p.value)}
                />
              ))}
            </div>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Status</span>
            <div className="flex flex-wrap gap-1.5">
              {TACTIC_STATUSES.map((s) => (
                <ChipToggle
                  key={s.value}
                  label={s.label}
                  active={tacticStatus === s.value}
                  onClick={() => setTacticStatus(s.value)}
                />
              ))}
            </div>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Objective</span>
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className={fieldClass}
              placeholder="What this tactic is here to achieve"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Optimised KPI</span>
            <input
              value={kpi}
              onChange={(e) => setKpi(e.target.value)}
              className={fieldClass}
              placeholder="e.g. view-through rate"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Role in the mix</span>
            <input
              value={roleInMix}
              onChange={(e) => setRoleInMix(e.target.value)}
              className={fieldClass}
              placeholder="e.g. reach, reappraisal, proof"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Audience</span>
            <div className="flex flex-wrap gap-1.5">
              {audience.map((a) => (
                <ChipToggle key={a} label={a} active onClick={() => toggleAudience(a)} />
              ))}
              {extraAudiencePresets.map((p) => (
                <ChipToggle key={p} label={p} active={false} onClick={() => toggleAudience(p)} />
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">
              <input
                value={customAudience}
                onChange={(e) => setCustomAudience(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomAudience();
                  }
                }}
                placeholder="+ add your own"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white focus:border-[var(--accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustomAudience}
                disabled={!customAudience.trim()}
                className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {customTagsAlreadyAdded.length > 0 && (
              <p className="text-[11px] text-white/30">Custom: {customTagsAlreadyAdded.join(", ")}</p>
            )}
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Audience detail</span>
            <input
              value={audienceDetail}
              onChange={(e) => setAudienceDetail(e.target.value)}
              className={fieldClass}
              placeholder="Specific mindset, behaviours, sub-cohort"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Format</span>
            <input
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className={fieldClass}
              placeholder="e.g. 15s vertical, 6-sheet"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Phase</span>
            <input
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className={fieldClass}
              placeholder="e.g. Tease, Announce, Sustain"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Budget</span>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className={fieldClass}
              placeholder="e.g. £25k, £100k–£150k, TBC"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Campaign dates</span>
            <CampaignDateRangeField
              startDate={campaignStart}
              endDate={campaignEnd}
              onChange={(start, end) => {
                setCampaignStart(start);
                setCampaignEnd(end);
              }}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Notes</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className={`${fieldClass} resize-none`}
              placeholder="Anything else worth flagging"
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || compressing}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Add tactic"}
          </button>
        </div>
      </form>
    </div>
  );
}
