# 004 — Make modal/sheet close interruptible (retarget instead of restart)

- **Status**: DROPPED — the proposed `open` boolean is set via a mount-only
  `useEffect(() => {...}, [])`, which won't re-fire if a caller keeps the
  same hook instance mounted across repeated open→close→open cycles (the
  exact case `useClosableOverlay`'s own code comment says it was built to
  handle, per the already-fixed bug in task #202 of this project's history).
  Executing this as written risks reintroducing that same class of bug
  across every modal in the app. Needs a corrected design before retrying —
  not executed.
- **Commit**: 46a1b7b
- **Severity**: HIGH
- **Category**: Interruptibility
- **Estimated scope**: 2 files (`src/hooks/useClosableOverlay.ts`, `src/app/globals.css`), ~40 lines changed

## Problem

`src/hooks/useClosableOverlay.ts` (full file, confirmed by direct read) drives every modal/sheet/card-sheet close in both apps:

```ts
/* src/hooks/useClosableOverlay.ts:23-33 — current */
export function useClosableOverlay(onClose: () => void, durationMs = DEFAULT_DURATION_MS) {
  const [closing, setClosing] = useState(false);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose();
      setClosing(false);
    }, durationMs);
  }

  return { closing, requestClose };
}
```

Callers swap between an `*-in` class and an `*-out` class based on `closing` (e.g. `className={closing ? "animate-modal-out" : "animate-modal-in"}`). Both classes are `@keyframes` animations (`src/app/globals.css:97-125`), and CSS `@keyframes` always start from their own hardcoded `0%`/`from` frame — not from the element's actual current on-screen position. If a user triggers `requestClose()` while the modal is still mid-open (e.g. clicking a backdrop within the first ~150ms of a 200ms open animation), the element visibly snaps to the `modal-out` keyframe's hardcoded starting pose (`opacity: 1; transform: translateY(0) scale(1)`) instead of continuing smoothly from wherever it actually was.

This is not a hypothetical — every modal in the app (`CampaignGanttBoard.tsx` `BlockFormModal`, `CampaignTimeline.tsx` `MilestoneEditModal`, `ideas/IdeaFolderView.tsx` `IdeaDetailSheet`, and every other consumer of `useClosableOverlay`) inherits this.

## Target

Replace the keyframe-swap pattern with a CSS-transition-driven one, so the browser retargets automatically from whatever the current computed style is — no JS timing math needed to "catch" the mid-flight position.

`src/app/globals.css` — replace the `modal-in`/`modal-out` keyframe pair with a single transition-based rule (repeat the same pattern for `sheet-in`/`sheet-out` and `card-sheet-in`/`card-sheet-out`):

```css
/* target — replaces the .animate-modal-in / .animate-modal-out keyframe pair */
.modal-surface {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  transition: opacity 0.18s var(--ease-out), transform 0.18s var(--ease-out);
}
.modal-surface[data-open="true"] {
  opacity: 1;
  transform: translateY(0) scale(1);
}
```

`src/hooks/useClosableOverlay.ts` target:

```ts
"use client";

import { useEffect, useState } from "react";

const DEFAULT_DURATION_MS = 220;

export function useClosableOverlay(onClose: () => void, durationMs = DEFAULT_DURATION_MS) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // Flips to true one tick after mount so the transition (opacity/transform
  // above) has a "false → true" edge to animate across, matching the
  // existing data-mounted pattern used elsewhere in this codebase.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setOpen(false);
    window.setTimeout(() => {
      onClose();
      setClosing(false);
    }, durationMs);
  }

  return { open, closing, requestClose };
}
```

## Repo conventions to follow

- This codebase already has the `data-mounted`/`useEffect`-driven entrance pattern documented as the "legacy fallback" for `@starting-style` in the loaded framework — use that shape (a boolean flipped one tick after mount via `requestAnimationFrame`), not `@starting-style` itself (browser support wasn't verified for this project's target matrix, so stay with the safer pattern already implied by the hook's existing `useState`-based design).
- `durationMs` is still consumed by the `setTimeout` in `requestClose` — this plan does not change the default duration (220ms), only how the visual transition is driven.
- Every call site currently does `className={closing ? "animate-modal-out" : "animate-modal-in"}` (or the `sheet`/`card-sheet` equivalents) — these need updating to `className="modal-surface" data-open={open && !closing}` (or the sheet/card-sheet class equivalents, added identically per the Steps below). Find every call site via `grep -rn "closing ? .animate-modal-out" src` (and the `sheet`/`card-sheet` variants) before editing the hook, so the rename is applied everywhere in the same change.

## Steps

1. In `src/app/globals.css`, replace the `@keyframes modal-in`/`modal-out` pair and their `.animate-modal-in`/`.animate-modal-out` classes (lines 97-125) with the `.modal-surface`/`.modal-surface[data-open="true"]` rule pair shown in Target. Repeat the same transformation for `sheet-in`/`sheet-out` (lines 127-155 → `.sheet-surface`) and `card-sheet-in`/`card-sheet-out` (lines 160-188 → `.card-sheet-surface`), preserving each variant's own current translateY/scale distances and duration — only replace the animation mechanism (keyframes → transition), not the visual values.
2. Update `src/hooks/useClosableOverlay.ts` to the Target shown above (adds `open` state, returns it alongside `closing`/`requestClose`).
3. Find every call site consuming `useClosableOverlay` (`grep -rln "useClosableOverlay" src`) and every place applying `animate-modal-in`/`animate-modal-out`/`animate-sheet-in`/`animate-sheet-out`/`animate-card-sheet-in`/`animate-card-sheet-out` classes. For each, replace the conditional-class pattern with the new fixed class + `data-open` attribute, e.g.:
   ```tsx
   // before
   className={closing ? "animate-modal-out" : "animate-modal-in"}
   // after
   className="modal-surface" data-open={open && !closing}
   ```
4. Confirm every call site also destructures the new `open` value from `useClosableOverlay(...)` alongside the existing `closing`/`requestClose`.

## Boundaries

- Do NOT change the visual entrance/exit distances (translateY offset, scale floor) for any of the three surface types — only the animation mechanism.
- Do NOT change `DEFAULT_DURATION_MS` or any per-call-site `durationMs` override.
- Do NOT touch `dropdown-unfurl`/`dropdown-furl` or `poof`/`poof-in` — those are separate keyframe families not driven by `useClosableOverlay` and out of scope for this plan.
- If any call site's current JSX doesn't match the `closing ? "animate-X-out" : "animate-X-in"` shape exactly (e.g. it's combined with other conditional classes in a template string), STOP and report that call site rather than guessing how to merge the new attribute in.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint <every file touched>`, `npm run build` — all clean.
- **Feel check**: open a modal (e.g. the Gantt board's `BlockFormModal`) and immediately click the backdrop to close it before the open animation finishes (~100ms in). Confirm:
  - The modal smoothly reverses from wherever it currently was — no visible jump/snap to a different pose.
  - In DevTools' Animations panel at 10% playback, open then immediately close and confirm the transform/opacity curve is continuous, not two separate discontinuous segments.
  - Repeat for a sheet (`IdeaDetailSheet`) and a card-sheet variant to confirm the same fix applies to all three surface types.
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm the modal still opens/closes (just without the transform component, per whatever plan 010 implements — if plan 010 hasn't landed yet, confirm at minimum that open/close still works, i.e. this plan doesn't break the reduced-motion path even before it exists).
- **Done when**: every modal/sheet/card-sheet in the app opens and closes via the new transition-based classes, `open`/`closing` are consumed consistently everywhere, and closing mid-open-animation no longer produces a visible snap.
