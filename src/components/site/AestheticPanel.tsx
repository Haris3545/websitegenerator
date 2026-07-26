"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useEditMode } from "@/components/site/EditModeContext";
import { updateArtistAesthetics } from "@/app/s/[slug]/actions";
import { ColorField } from "@/components/builder/ColorField";
import { FontPicker } from "@/components/builder/FontPicker";
import { DEFAULT_THEME_OVERRIDES, type ThemeOverrides } from "@/lib/theme";
import type { AestheticParams } from "@/lib/database.types";

const DEFAULT_AESTHETIC_PARAMS: Required<AestheticParams> = {
  grain_intensity: 0,
  tint_opacity: 0,
  blur: 0,
  vignette: 0,
  chromatic_aberration: 0,
};

type Aesthetics = {
  primary_color: string;
  accent_color: string;
  font_family: string;
  theme_overrides: ThemeOverrides;
  aesthetic_params: AestheticParams;
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-xs text-white/40">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-builder-accent"
      />
    </label>
  );
}

/** A quick, on-page aesthetic-tweaking panel reachable from Edit Mode, so
 * taste-level adjustments (colours, font, card look) don't require leaving
 * the live site for the builder's fuller ThemeEditor. Deeper background-
 * image controls (pan/zoom/contrast) stay builder-only, where there's a
 * dedicated preview to drag against.
 *
 * Live-previews by writing straight to the CSS custom properties the site
 * shell (see layout.tsx) already reads from `#site-root` — the same
 * variables themeToCssVars sets server-side — rather than waiting on a
 * round trip through Supabase + cache revalidation for every slider tick.
 * The actual save is debounced separately so dragging a slider doesn't fire
 * a write per frame. */
export function AestheticPanel({ artistId, initial }: { artistId: string; initial: Aesthetics }) {
  const { editMode } = useEditMode();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const isFirstRender = useRef(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.getElementById("site-root");
    if (!root) return;
    const t = { ...DEFAULT_THEME_OVERRIDES, ...values.theme_overrides };
    root.style.setProperty("--primary", values.primary_color);
    root.style.setProperty("--accent", values.accent_color);
    root.style.fontFamily = `"${values.font_family}", sans-serif`;
    root.style.setProperty("--card-radius", `${t.card_radius}px`);
    root.style.setProperty("--card-bg-opacity", String(t.card_bg_opacity));
    root.style.setProperty("--card-border-opacity", String(t.card_border_opacity));
    root.style.setProperty("--card-text-color", t.card_text_color);
    root.style.setProperty("--header-font-weight", t.header_bold ? "700" : "400");
    root.style.setProperty("--header-font-style", t.header_italic ? "italic" : "normal");

    const a = { ...DEFAULT_AESTHETIC_PARAMS, ...values.aesthetic_params };
    root.style.setProperty("--bg-blur", `${a.blur * 12}px`);
    root.style.setProperty("--bg-tint-opacity", String(a.tint_opacity * 0.65));
    root.style.setProperty("--bg-vignette", String(a.vignette));
    root.style.setProperty("--bg-grain-opacity", String(a.grain_intensity));
    document.getElementById("chroma-offset-r")?.setAttribute("dx", String(a.chromatic_aberration * 8));
    document.getElementById("chroma-offset-b")?.setAttribute("dx", String(a.chromatic_aberration * -8));
  }, [values]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      startTransition(() => {
        updateArtistAesthetics(artistId, values);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [values, artistId, startTransition]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!editMode) return null;

  const theme = { ...DEFAULT_THEME_OVERRIDES, ...values.theme_overrides };
  function setTheme<K extends keyof ThemeOverrides>(key: K, v: ThemeOverrides[K]) {
    setValues((s) => ({ ...s, theme_overrides: { ...s.theme_overrides, [key]: v } }));
  }

  const aesthetics = { ...DEFAULT_AESTHETIC_PARAMS, ...values.aesthetic_params };
  function setAesthetic<K extends keyof AestheticParams>(key: K, v: AestheticParams[K]) {
    setValues((s) => ({ ...s, aesthetic_params: { ...s.aesthetic_params, [key]: v } }));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-lg shadow-lg shadow-black/40 transition-transform duration-150 ease-out hover:scale-110 active:scale-95"
        aria-label="Aesthetic settings"
        title="Tweak the look"
      >
        🎨
      </button>

      <div
        ref={panelRef}
        className={`dark fixed bottom-24 right-6 z-50 flex max-h-[70vh] w-80 origin-bottom-right flex-col gap-4 overflow-y-auto rounded-xl border border-white/15 bg-neutral-950/95 p-4 text-white shadow-2xl shadow-black/50 backdrop-blur-md transition-all duration-200 ease-out ${
          open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }`}
      >
        <p className="text-sm font-semibold">Fine-tune the look</p>

        <ColorField
          label="Primary colour"
          value={values.primary_color}
          onChange={(v) => setValues((s) => ({ ...s, primary_color: v }))}
        />
        <ColorField
          label="Accent colour"
          value={values.accent_color}
          onChange={(v) => setValues((s) => ({ ...s, accent_color: v }))}
        />
        <FontPicker
          value={values.font_family}
          onChange={(v) => setValues((s) => ({ ...s, font_family: v }))}
        />

        <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-white/50">Cards</p>
          <Slider
            label="Corner roundedness"
            min={0}
            max={32}
            step={1}
            value={theme.card_radius}
            onChange={(v) => setTheme("card_radius", v)}
            unit="px"
          />
          <Slider
            label="Background darkness"
            min={0}
            max={0.8}
            step={0.05}
            value={theme.card_bg_opacity}
            onChange={(v) => setTheme("card_bg_opacity", v)}
          />
          <Slider
            label="Border visibility"
            min={0}
            max={0.5}
            step={0.05}
            value={theme.card_border_opacity}
            onChange={(v) => setTheme("card_border_opacity", v)}
          />
          <ColorField
            label="Card text colour"
            value={theme.card_text_color}
            onChange={(v) => setTheme("card_text_color", v)}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-white/50">Title</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={theme.header_bold}
              onChange={(e) => setTheme("header_bold", e.target.checked)}
              className="accent-builder-accent"
            />
            Bold
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={theme.header_italic}
              onChange={(e) => setTheme("header_italic", e.target.checked)}
              className="accent-builder-accent"
            />
            Italic
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-white/50">Background effects</p>
          <Slider
            label="Animated film grain"
            min={0}
            max={1}
            step={0.05}
            value={aesthetics.grain_intensity}
            onChange={(v) => setAesthetic("grain_intensity", v)}
          />
          <Slider
            label="Chromatic aberration"
            min={0}
            max={1}
            step={0.05}
            value={aesthetics.chromatic_aberration}
            onChange={(v) => setAesthetic("chromatic_aberration", v)}
          />
          <Slider
            label="Vignette"
            min={0}
            max={1}
            step={0.05}
            value={aesthetics.vignette}
            onChange={(v) => setAesthetic("vignette", v)}
          />
          <Slider
            label="Colour tint"
            min={0}
            max={1}
            step={0.05}
            value={aesthetics.tint_opacity}
            onChange={(v) => setAesthetic("tint_opacity", v)}
          />
          <Slider
            label="Blur"
            min={0}
            max={1}
            step={0.05}
            value={aesthetics.blur}
            onChange={(v) => setAesthetic("blur", v)}
          />
          <p className="text-xs text-white/30">
            For anything else — describe it in the Aesthetic tailoring box in Builder and it&apos;ll be parsed
            automatically.
          </p>
        </div>
      </div>
    </>
  );
}
