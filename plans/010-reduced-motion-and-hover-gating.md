# 010 — Add repo-wide prefers-reduced-motion and hover-capability gating

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 2 new files + `src/app/globals.css` + ~45 className edits across ~20 files

## Problem

Confirmed via repo-wide grep: `prefers-reduced-motion` is checked in exactly 2 of the app's 30+ animated files (`AlbumCoverFlow.tsx`, `TourGlobe.tsx`); `@media (hover: hover)` appears **zero** times anywhere. Every keyframe in `globals.css` (`jiggle`, `modal-in/out`, `sheet-in/out`, `card-sheet-in/out`, `poof`/`poof-in`/`poof-particle`, `hint-pulse`, `pin-drop-in`, `dropdown-unfurl/furl`, `tab-in`, `grain-shift`) runs unconditionally, and the ~40 `hover:-translate-y-*`/`hover:scale-*` Tailwind utilities across both apps apply on tap on touch devices with no gate.

`globals.css:193-200` is the sharpest example — an infinite, ungated rotation loop:
```css
/* current */
@keyframes jiggle {
  0%, 100% { transform: rotate(-0.5deg); }
  50% { transform: rotate(0.5deg); }
}
.animate-jiggle {
  animation: jiggle 0.26s ease-in-out infinite;
}
```

This plan does not attempt to add per-component reduced-motion branches everywhere (that would be a much larger, riskier plan) — it does the two things that make every future component's job trivial: (1) a global CSS escape hatch that mutes movement everywhere at once, and (2) a shared hook that any component can opt into for JS-driven motion decisions, generalizing the pattern `AlbumCoverFlow.tsx` already built well.

## Target

**1. Global CSS safety net** — add to `src/app/globals.css`, after the existing keyframe block:

```css
/* Blanket reduced-motion fallback: shortens/flattens every keyframe
   animation in this file to a fast opacity-only fade, and disables the
   one infinite decorative loop entirely. Individual components with
   JS-driven motion (drag, gesture) should additionally branch off
   usePrefersReducedMotion() (see src/hooks/usePrefersReducedMotion.ts)
   since this media query can't reach inline styles. */
@media (prefers-reduced-motion: reduce) {
  .animate-tab-in,
  .animate-modal-in, .animate-modal-out,
  .animate-sheet-in, .animate-sheet-out,
  .animate-card-sheet-in, .animate-card-sheet-out,
  .animate-poof, .animate-poof-in, .animate-poof-particle,
  .animate-pin-drop-in,
  .animate-dropdown-unfurl, .animate-dropdown-furl {
    animation-duration: 0.12s !important;
    animation-timing-function: ease !important;
  }
  .animate-jiggle,
  .animate-hint-pulse,
  .animate-grain {
    animation: none !important;
  }
}
```

**2. Shared hook** — new file `src/hooks/usePrefersReducedMotion.ts`, generalizing the exact pattern already in `AlbumCoverFlow.tsx:10-20`:

```ts
"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getServerSnapshot() {
  return false;
}

/** Reactive prefers-reduced-motion read — use for any component driving
 * motion via inline styles/JS (drag, gesture, canvas), where the CSS media
 * query in globals.css can't reach. Keep opacity/color transitions when
 * branching on this; only drop movement/transform. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

**3. Hover-capability gate** — Tailwind v4 supports arbitrary media-query variants; wrap each of the ~40 `hover:` utilities in a `[@media(hover:hover)_and_(pointer:fine)]:` variant. Example for `KpiCard.tsx:27`:

```tsx
/* before */
className="... transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_28px_var(--accent)]"

/* after */
className="... transition-all duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 [@media(hover:hover)_and_(pointer:fine)]:hover:brightness-110 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0_0_28px_var(--accent)]"
```

Given the verbosity of repeating this variant prefix ~120 times (3 hover utilities × ~40 sites), define a Tailwind `@custom-variant` instead, once, in `globals.css`:

```css
/* target — src/app/globals.css, near the existing @custom-variant dark declaration */
@custom-variant hover-capable (&:where(html.hover-capable *));
```

paired with a tiny inline script or root-level `useEffect` that adds/removes a `hover-capable` class on `<html>` based on the same media query — OR, simpler and requiring no JS at all, use Tailwind's built-in arbitrary variant syntax directly per call site as shown above without a custom variant, accepting the verbosity. **Choose the arbitrary-variant-per-site approach** (no custom variant, no JS toggle) for this plan — it's mechanical, requires no new runtime behavior, and matches this repo's existing preference for CSS-only solutions where possible (see AUDIT §5: "CSS beats rAF-based JS under load").

## Repo conventions to follow

- `AlbumCoverFlow.tsx:10-20`'s `useSyncExternalStore` pattern is the exact shape to generalize — the new hook is a direct lift of that code, just moved to a shared location and renamed.
- This repo's `@custom-variant dark (&:where(.dark, .dark *));` at the top of `globals.css` is the existing precedent for a custom Tailwind v4 variant — reference it for syntax if the hover-capable custom-variant path is chosen instead of per-site arbitrary variants (not chosen for this plan, per above, but useful as a syntax reference).

## Steps

1. Create `src/hooks/usePrefersReducedMotion.ts` with the content in Target.
2. In `src/components/site/AlbumCoverFlow.tsx`, replace the local `subscribeReducedMotion`/`getReducedMotionSnapshot`/`getReducedMotionServerSnapshot`/`useSyncExternalStore` call (lines 10-34 per the accessibility audit) with an import of the new shared hook, removing the now-duplicated local implementation.
3. In `src/components/site/AlbumCoverFlow.tsx:220-222`, fix the accessibility finding already identified there: change `transition: isDragging || reducedMotion ? "none" : "transform 0.35s ease, opacity 0.35s ease"` so that when `reducedMotion` is true (but not dragging), `opacity` keeps transitioning and only `transform` is dropped — e.g. `transition: isDragging ? "none" : reducedMotion ? "opacity 0.2s ease" : "transform 0.35s ease, opacity 0.35s ease"`.
4. In `src/app/globals.css`, add the `@media (prefers-reduced-motion: reduce)` block from Target, placed after all the keyframe definitions (end of file is fine, or immediately after the `:root`/`@theme` blocks — match whatever placement keeps related rules visually grouped, per the file's existing loose organization).
5. Grep for every `hover:-translate` / `hover:scale` / `hover:brightness` / `hover:shadow` Tailwind utility across `src/` (`grep -rn "hover:-translate\|hover:scale\|hover:brightness\|hover:shadow" src`) and wrap each in the `[@media(hover:hover)_and_(pointer:fine)]:` prefix as shown in Target, one file at a time. This will touch approximately 20 files — work through them systematically and note the exact list in your final report so a reviewer can spot-check coverage.

## Boundaries

- Do NOT touch color-only `hover:` utilities (e.g. `hover:bg-neutral-50`, `hover:text-white`) — only ones that apply `transform` (translate/scale/rotate), since color-only hover doesn't cause the "stuck" touch-hover problem the gate exists to prevent.
- Do NOT change any animation's actual visual values (distances, colors) — only add the reduced-motion fallback and hover gating around them.
- Do NOT introduce a `hover-capable` custom variant / JS toggle — this plan uses the arbitrary-variant-per-site approach only, per the Target section's explicit choice.
- If the list of `hover:` utilities found via grep is substantially larger than ~40 (drift since commit 46a1b7b), STOP after completing the first 10-15 files and report the fuller scope rather than silently expanding this plan's size.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint <every touched file>`, `npm run build` — all clean.
- **Feel check**:
  - In Chrome DevTools' Rendering panel, set "Emulate CSS media feature prefers-reduced-motion: reduce" and reload. Confirm: modals/sheets still open/close but faster and without the translate/scale component (a plain quick fade); the `IdeaFolderView` select-mode jiggle stops entirely; the Locations map "Pin" button hint-pulse stops; `AestheticPanel`'s grain animation stops; the cover-flow's opacity fade still plays but its transform settle is skipped.
  - On an actual touch device (or Chrome DevTools' device toolbar with touch simulation), tap a KPI card and confirm it no longer stays visually "lifted" after your finger leaves the screen.
  - With reduced-motion OFF, confirm every animation looks exactly as it did before this plan — this plan should be invisible under normal settings.
- **Done when**: the reduced-motion media query and shared hook both exist and are wired into `AlbumCoverFlow.tsx`, every `transform`-based hover utility found via the grep sweep is gated behind the hover-capability variant, and toggling the OS/browser reduced-motion setting visibly changes behavior without breaking anything.
