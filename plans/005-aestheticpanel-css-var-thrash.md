# 005 — Stop AestheticPanel from writing 11 CSS vars to the site root on every slider tick

- **Status**: DONE
- **Commit**: 46a1b7b
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 1 file (`src/components/site/AestheticPanel.tsx`), ~20 lines changed

## Problem

`src/components/site/AestheticPanel.tsx:80-102` (confirmed by the performance-category audit subagent, citing the file directly) writes eleven CSS custom properties onto `document.getElementById("site-root")` inside a `useEffect` that re-fires on every `values` state change — and `values` updates on every `input` event while a user drags any aesthetic slider (color, radius, opacity, blur, grain, font weight/style):

```tsx
/* src/components/site/AestheticPanel.tsx:80-102 — current (paraphrased from the audit; verify exact lines on open) */
useEffect(() => {
  const root = document.getElementById("site-root");
  if (!root) return;
  root.style.setProperty("--primary", values.primary_color);
  root.style.setProperty("--accent", values.accent_color);
  root.style.fontFamily = `"${values.font_family}", sans-serif`;
  root.style.setProperty("--card-radius", `${t.card_radius}px`);
  root.style.setProperty("--card-bg-opacity", String(t.card_bg_opacity));
  root.style.setProperty("--card-border-opacity", String(t.card_border_opacity));
  root.style.setProperty("--card-text-color", t.card_text_color);
  root.style.setProperty("--header-font-weight", /* ... */);
  root.style.setProperty("--header-font-style", /* ... */);
  root.style.setProperty("--bg-blur", `${a.blur * 12}px`);
  root.style.setProperty("--bg-tint-color", a.tint_color);
  root.style.setProperty("--bg-tint-opacity", /* ... */);
  root.style.setProperty("--bg-vignette", /* ... */);
  root.style.setProperty("--bg-grain-opacity", /* ... */);
  root.style.setProperty("--bg-grain-image", grainTexture(/* ... */));
}, [values]);
```

Setting a CSS custom property on `#site-root` (an ancestor wrapping the entire live-preview site) forces the browser to recompute styles for every descendant that reads any of these variables — every card, the header, the background layer — on every single `input` event, not just the one visual region actually changing. During an active slider drag this can fire dozens of times per second, competing with the drag's own paint work.

## Target

Batch the writes so at most one style recalculation happens per animation frame, using `requestAnimationFrame` to coalesce rapid-fire slider events:

```tsx
/* target */
const pendingValuesRef = useRef(values);
const rafIdRef = useRef<number | null>(null);

useEffect(() => {
  pendingValuesRef.current = values;
  if (rafIdRef.current !== null) return; // already scheduled for this frame

  rafIdRef.current = requestAnimationFrame(() => {
    rafIdRef.current = null;
    const root = document.getElementById("site-root");
    if (!root) return;
    const { values: v, t, a } = /* derive from pendingValuesRef.current, same as before */;
    root.style.setProperty("--primary", v.primary_color);
    root.style.setProperty("--accent", v.accent_color);
    root.style.fontFamily = `"${v.font_family}", sans-serif`;
    root.style.setProperty("--card-radius", `${t.card_radius}px`);
    root.style.setProperty("--card-bg-opacity", String(t.card_bg_opacity));
    root.style.setProperty("--card-border-opacity", String(t.card_border_opacity));
    root.style.setProperty("--card-text-color", t.card_text_color);
    root.style.setProperty("--header-font-weight", /* unchanged */);
    root.style.setProperty("--header-font-style", /* unchanged */);
    root.style.setProperty("--bg-blur", `${a.blur * 12}px`);
    root.style.setProperty("--bg-tint-color", a.tint_color);
    root.style.setProperty("--bg-tint-opacity", /* unchanged */);
    root.style.setProperty("--bg-vignette", /* unchanged */);
    root.style.setProperty("--bg-grain-opacity", /* unchanged */);
    root.style.setProperty("--bg-grain-image", grainTexture(/* unchanged */));
  });

  return () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  };
}, [values]);
```

This still applies every value on every change (nothing is dropped), but collapses N rapid `input` events within one frame into a single DOM write, so the browser only recalculates styles once per ~16ms frame instead of once per event.

## Repo conventions to follow

- `src/components/builder/ThemeEditor.tsx:186` already does the *scoping* half of this correctly (computes `filter: blur(...)` directly on the one preview element that needs it, rather than fanning out through a shared ancestor) — use it as a reference for "write only what's needed," but note `ThemeEditor.tsx` doesn't have this component's rAF-coalescing problem in the first place since it's not writing to a shared root; don't copy its structure wholesale, just its instinct to minimize DOM writes.
- Keep the exact same eleven properties and their exact computed values (do not change what's written, only when/how often).

## Steps

1. Open `src/components/site/AestheticPanel.tsx` and locate the `useEffect` at (approximately) lines 80-102 that writes to `document.getElementById("site-root")`.
2. Add two refs above the effect: `pendingValuesRef` (holds the latest `values`) and `rafIdRef` (holds the pending `requestAnimationFrame` id or `null`).
3. Restructure the effect body per the Target above: on every `values` change, update `pendingValuesRef.current` and schedule a single rAF callback (only if one isn't already pending) that performs all eleven `setProperty` calls using the latest pending values, then clears `rafIdRef.current`.
4. Add a cleanup function that cancels any pending rAF on unmount.
5. Verify the derivation of `t`/`a` (or whatever the current variable names are for the theme/aesthetic sub-objects) still reads from `pendingValuesRef.current` inside the rAF callback, not from a stale closure over the effect's own `values` parameter.

## Boundaries

- Do NOT change which CSS custom properties are written or their computed values — only the timing/batching.
- Do NOT touch `ThemeEditor.tsx` or any other component.
- Do NOT introduce a new dependency (no debounce library) — `requestAnimationFrame` is sufficient and matches this repo's existing no-library approach to animation.
- If the effect's actual current line range or variable names (`t`, `a`, etc.) differ from what's shown here when you open the file, STOP and report the actual shape rather than forcing this structure onto different code.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/components/site/AestheticPanel.tsx`, `npm run build` — all clean.
- **Feel check**: open the builder's Aesthetic panel for an artist, open Chrome DevTools' Performance panel, start recording, and drag the blur or grain-opacity slider continuously for ~2 seconds. Confirm:
  - The recording shows far fewer "Recalculate Style" entries than before the fix (roughly one per animation frame instead of one per `input` event).
  - The live preview still updates smoothly and with no visible lag behind the slider position — the fix should be imperceptible in output, only measurable in the trace.
  - No console errors from a stale/undefined `root` reference if the panel unmounts mid-drag (navigate away while dragging, confirm no error).
- **Done when**: the Performance trace shows coalesced recalculation, the preview still tracks the slider in real time, and no dropped/stale value ever reaches the DOM (rapidly drag then release and confirm the final on-screen state matches the slider's final position exactly).
