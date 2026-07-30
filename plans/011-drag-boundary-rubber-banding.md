# 011 — Add rising resistance at drag boundaries instead of hard stops

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 3 files, ~10 lines each

## Problem

Three independent drag systems hard-clamp position at their domain boundary with no resistance as the user approaches it — per the loaded framework, "a hard stop reads as frozen; continuous resistance reads as responsive, but there's nothing more here."

```ts
/* src/components/site/CampaignTimeline.tsx:187-196 — current */
function handleDotPointerMove(e) {
  // ...
  const raw = ds.startLeft + dx;
  const max = scrollMode ? trackWidth : containerWidth;
  setDragVisual({ id: ds.id, left: Math.max(0, Math.min(max, raw)) }); // hard clamp
}
```

```ts
/* src/components/site/CampaignGanttBoard.tsx:115-117 — current */
function clampIdx(i) {
  return Math.max(0, Math.min(DOMAIN_TOTAL_DAYS - 1, i));
}
/* used at 330,332 for resize-edge drag, and 386-387 for whole-block move drag */
```

```ts
/* src/components/site/AlbumCoverFlow.tsx:151-153 — current */
function clamp(i) {
  return Math.max(0, Math.min(albums.length - 1, i));
}
/* used at 86, 130, 132 for pointer-drag release and the wheel/trackpad path */
```

## Target

Apply the exact rubber-band formula named in the loaded framework wherever a raw drag position is computed, before clamping to the hard domain bounds — the formula progressively reduces how far the visual position follows the pointer as the overshoot grows, so it never actually exceeds a soft ceiling near the true boundary:

```ts
/* target — shared helper, add to a suitable shared location, e.g. src/lib/rubberband.ts */
/** The further past the bound, the less the element follows — matches iOS's
 * scroll-boundary resistance. `overshoot` is how far past the bound the raw
 * drag position is (can be negative for the low bound); `dimension` is the
 * total draggable range (used to scale how much resistance feels right for
 * this element's size). */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
```

`CampaignTimeline.tsx` target:
```ts
function handleDotPointerMove(e) {
  // ...
  const raw = ds.startLeft + dx;
  const max = scrollMode ? trackWidth : containerWidth;
  let visual = raw;
  if (raw < 0) visual = rubberband(raw, max);
  else if (raw > max) visual = max + rubberband(raw - max, max);
  setDragVisual({ id: ds.id, left: visual });
}
```
(The actual *commit* on release should still clamp hard via the existing `Math.max(0, Math.min(max, ...))` — only the live drag-visual gets the soft resistance; confirm the commit/release handler is separate from `handleDotPointerMove` before assuming this.)

`AlbumCoverFlow.tsx` and `CampaignGanttBoard.tsx` targets follow the identical shape: apply `rubberband()` to the live drag-offset/index used for the *visual* position (not the eventual committed index), keeping the existing `clamp()`/`clampIdx()` for whatever value actually gets persisted on release.

## Repo conventions to follow

- `AlbumCoverFlow.tsx` already imports nothing beyond React for its drag math — the new `rubberband()` helper should be a plain, dependency-free function matching that style, not wrapped in a class or requiring new state.
- This repo has no existing `src/lib/` file specifically for shared math helpers used across drag components — check `src/lib/` for a suitable existing file (e.g. anything already imported by more than one of these three components) before creating a new `rubberband.ts`; if one exists, add the function there instead.

## Steps

1. Search `src/lib/` for any existing shared utility file already imported by two or more of `CampaignTimeline.tsx`, `CampaignGanttBoard.tsx`, `AlbumCoverFlow.tsx` (`grep -l` each file's import lines against `src/lib/*.ts`). If found, add `rubberband()` there; otherwise create `src/lib/rubberband.ts` with the function shown in Target.
2. In `CampaignTimeline.tsx`, import `rubberband` and apply it in `handleDotPointerMove` (lines 187-196) as shown in Target — confirm whether the release/commit handler (search for where `dragVisual` is consumed to produce a final value) already clamps separately; if it reads directly from `dragVisual.left` without its own clamp, add one there so the soft-resistance value never gets persisted as the milestone's actual position.
3. In `CampaignGanttBoard.tsx`, find the two call sites of `clampIdx` used for live drag visuals (resize-edge at ~330/332, block-move at ~386-387) and apply `rubberband()` to the pre-clamp raw index before it's used to compute `moveVisual`'s rendered position, while keeping `clampIdx` itself unchanged for whatever gets committed on pointer-up.
4. In `AlbumCoverFlow.tsx`, apply `rubberband()` to the live `dragOffset`-driven position (used in the `rel = i - index + dragOffset / COVER_GAP` calculation) when `index` is at 0 or `albums.length - 1`, so dragging past the first/last album shows resistance during the drag itself rather than only snapping back after release.

## Boundaries

- Do NOT change what actually gets committed/persisted on drag release in any of the three components — only the live, in-progress visual position gets the soft-resistance treatment.
- Do NOT change the `constant` parameter's default (0.55, per the loaded framework's own named value) without a specific reason documented in your own commit — it's the framework's stated default and shouldn't be tuned per-component without evidence.
- Do NOT touch any other drag system beyond these three (e.g. `ArtistsBoard.tsx`'s icon drag has no domain boundary in the same sense — folders aren't range-bounded — so it's out of scope).
- If any of the three components' cited line numbers or function names have drifted since commit 46a1b7b, STOP and report rather than guessing which function is the "live visual" one.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint <all touched files>`, `npm run build` — all clean.
- **Feel check**: 
  - Drag a Campaign Timeline milestone dot past the left edge of its track and confirm it now visibly resists (slows, doesn't follow 1:1) rather than stopping dead — release and confirm it still snaps back to the actual left boundary (0).
  - Drag a Gantt block past the start of the visible date range and confirm the same soft-resistance feel; release and confirm the committed position is still correctly clamped.
  - Swipe/drag past the first or last album in the Music tab's cover flow and confirm the same resistance during the drag, with the existing snap-back animation still playing correctly on release.
  - In DevTools' Animations/Performance panel, confirm no dropped frames are introduced by the extra math (the formula is cheap, single-call-per-pointermove).
- **Done when**: all three drag systems show progressive resistance approaching their boundary during an active drag, and none of them allow the committed/persisted value to exceed the true domain bound.
