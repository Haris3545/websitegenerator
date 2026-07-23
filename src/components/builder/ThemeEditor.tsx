"use client";

import { useRef, useState, type CSSProperties } from "react";
import { DEFAULT_THEME_OVERRIDES, type ThemeOverrides } from "@/lib/theme";
import { ColorField } from "@/components/builder/ColorField";

type Selection = "background" | "header" | "cards" | null;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function ThemeEditor({
  value,
  onChange,
  primaryColor,
  accentColor,
  fontFamily,
  backgroundImageUrl,
  projectTitle,
  tagline,
  artistName,
}: {
  value: ThemeOverrides;
  onChange: (next: ThemeOverrides) => void;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  backgroundImageUrl: string | null;
  projectTitle: string;
  tagline: string;
  artistName: string;
}) {
  const [selected, setSelected] = useState<Selection>(null);
  const [dragging, setDragging] = useState(false);
  const t = { ...DEFAULT_THEME_OVERRIDES, ...value };

  const dragState = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    moved: boolean;
  } | null>(null);

  function set<K extends keyof ThemeOverrides>(key: K, v: ThemeOverrides[K]) {
    onChange({ ...value, [key]: v });
  }

  function ring(part: Selection) {
    return selected === part ? "outline outline-2 outline-offset-2 outline-[var(--accent-ring)]" : "";
  }

  function handleBgPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!backgroundImageUrl) return;
    // Don't select or capture yet — a plain click on this element (rather
    // than on the header/card children, which stopPropagation their own
    // clicks) still needs to fall through to a native "click" below so
    // simple taps keep working. Capture is only claimed once we confirm an
    // actual drag in handleBgPointerMove.
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: t.bg_position_x,
      startPosY: t.bg_position_y,
      moved: false,
    };
  }

  function handleBgPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      ds.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    if (!ds.moved) return;

    const rect = e.currentTarget.getBoundingClientRect();
    set("bg_position_x", Math.round(clamp(ds.startPosX - (dx / rect.width) * 100, 0, 100)));
    set("bg_position_y", Math.round(clamp(ds.startPosY - (dy / rect.height) * 100, 0, 100)));
    setSelected("background");
  }

  function handleBgPointerUp() {
    const ds = dragState.current;
    dragState.current = null;
    setDragging(false);
    if (ds && !ds.moved) setSelected("background");
  }

  return (
    <div className="flex flex-col gap-4 text-sm" style={{ "--accent-ring": accentColor } as CSSProperties}>
      <div>
        <p className="font-medium">Fine-tune the look, by hand</p>
        <p className="text-xs text-neutral-900">
          Click a part of the preview below to select it, then adjust it with the controls that
          appear underneath.
        </p>
      </div>

      <div
        onPointerDown={handleBgPointerDown}
        onPointerMove={handleBgPointerMove}
        onPointerUp={handleBgPointerUp}
        className={`relative h-72 w-full overflow-hidden rounded-lg text-white ${ring("background")} ${
          backgroundImageUrl ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        style={{ backgroundColor: "#111", fontFamily: `"${fontFamily}", sans-serif` }}
      >
        {backgroundImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundImageUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover select-none"
            style={{
              filter: `contrast(${t.bg_contrast}) saturate(${t.bg_saturate})`,
              objectPosition: `${t.bg_position_x}% ${t.bg_position_y}%`,
              transform: `scale(${t.bg_zoom})`,
            }}
          />
        )}
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${t.bg_scrim_opacity})` }} />

        <div className="relative flex h-full flex-col justify-between p-4">
          <div
            onClick={(e) => {
              e.stopPropagation();
              setSelected("header");
            }}
            className={`inline-block w-fit rounded px-1 ${ring("header")}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
              {tagline || "Tagline"}
            </p>
            <p
              className="text-2xl"
              style={{
                fontWeight: t.header_bold ? 700 : 400,
                fontStyle: t.header_italic ? "italic" : "normal",
              }}
            >
              {projectTitle || "Project title"}
            </p>
          </div>

          <div className="flex gap-3">
            {[artistName || "Sample stat", "Another stat"].map((label, i) => (
              <div
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected("cards");
                }}
                className={`flex-1 p-3 ${ring("cards")}`}
                style={{
                  borderRadius: `${t.card_radius}px`,
                  backgroundColor: `rgba(0,0,0,${t.card_bg_opacity})`,
                  border: `1px solid rgba(255,255,255,${t.card_border_opacity})`,
                }}
              >
                <p className="text-[10px] uppercase tracking-wide opacity-60" style={{ color: t.card_text_color }}>
                  {label}
                </p>
                <p className="mt-1 text-lg font-bold" style={{ color: primaryColor }}>
                  128
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded border border-neutral-200 p-4">
        {selected === null && (
          <p className="text-neutral-900">Click the background, the title, or a card above.</p>
        )}

        {selected === "background" && (
          <div className="flex flex-col gap-3">
            <p className="font-medium">Background photo/video</p>
            <p className="text-xs text-neutral-900">
              Drag directly on the preview to reposition it. The zoom slider below resizes it.
            </p>
            <Slider
              label="Zoom / resize"
              min={1}
              max={2.5}
              step={0.05}
              value={t.bg_zoom}
              onChange={(v) => set("bg_zoom", v)}
              displayUnit="x"
            />
            <Slider
              label="Contrast"
              min={0.5}
              max={2}
              step={0.05}
              value={t.bg_contrast}
              onChange={(v) => set("bg_contrast", v)}
            />
            <Slider
              label="Saturation"
              min={0.5}
              max={2}
              step={0.05}
              value={t.bg_saturate}
              onChange={(v) => set("bg_saturate", v)}
            />
            <Slider
              label="Darkness overlay"
              min={0}
              max={0.8}
              step={0.05}
              value={t.bg_scrim_opacity}
              onChange={(v) => set("bg_scrim_opacity", v)}
            />
          </div>
        )}

        {selected === "header" && (
          <div className="flex flex-col gap-3">
            <p className="font-medium">Project title text</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={t.header_bold}
                onChange={(e) => set("header_bold", e.target.checked)}
              />
              Bold
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={t.header_italic}
                onChange={(e) => set("header_italic", e.target.checked)}
              />
              Italic
            </label>
          </div>
        )}

        {selected === "cards" && (
          <div className="flex flex-col gap-3">
            <p className="font-medium">Cards (dashboard stats, articles, boards)</p>
            <Slider
              label="Corner roundedness"
              min={0}
              max={32}
              step={1}
              value={t.card_radius}
              onChange={(v) => set("card_radius", v)}
              displayUnit="px"
            />
            <Slider
              label="Background darkness"
              min={0}
              max={0.8}
              step={0.05}
              value={t.card_bg_opacity}
              onChange={(v) => set("card_bg_opacity", v)}
            />
            <Slider
              label="Border visibility"
              min={0}
              max={0.5}
              step={0.05}
              value={t.card_border_opacity}
              onChange={(v) => set("card_border_opacity", v)}
            />
            <ColorField
              label="Text colour"
              value={t.card_text_color}
              onChange={(v) => set("card_text_color", v)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  displayUnit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  displayUnit?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-xs text-neutral-900">
          {value}
          {displayUnit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
