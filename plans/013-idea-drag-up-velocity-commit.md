# 013 — Add velocity-based commit to IdeaFolderView's drag-up-to-return gesture

- **Status**: DONE
- **Commit**: 46a1b7b
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 1 file (`src/components/site/ideas/IdeaFolderView.tsx`), ~10 lines

## Problem

`src/components/site/ideas/IdeaFolderView.tsx:8,301-321` gates the drag-up-to-return-to-stack gesture on distance alone:

```ts
/* IdeaFolderView.tsx:8 — current */
const DRAG_UP_COMMIT_PX = 80;

/* IdeaFolderView.tsx:301-321 — current (paraphrased from the audit; verify exact lines) */
const committed = dragStarted && dy <= -DRAG_UP_COMMIT_PX;
if (committed) commitMove(ids, "pending");
```

A fast, short flick upward that clearly signals intent doesn't commit unless it happens to cross 80px, even though this app's own better-built gesture systems (`useSwipeGesture.ts`, `AlbumCoverFlow.tsx`) already use velocity as an alternate commit path.

## Target

Track the gesture's start time alongside its start position (if not already tracked — confirm on open), and add a velocity-based OR condition matching the exact formula and threshold already established elsewhere in this codebase:

```ts
/* target */
const DRAG_UP_COMMIT_PX = 80;
const DRAG_UP_COMMIT_VELOCITY_PX_MS = 0.11; // matches the framework's named threshold

// at pointer-up, with dragStartTime tracked alongside the existing drag-start position
const elapsedMs = Date.now() - dragStartTime;
const velocity = Math.abs(dy) / Math.max(elapsedMs, 1);
const committed = dragStarted && (dy <= -DRAG_UP_COMMIT_PX || (dy < 0 && velocity > DRAG_UP_COMMIT_VELOCITY_PX_MS));
if (committed) commitMove(ids, "pending");
```

## Repo conventions to follow

- `AlbumCoverFlow.tsx`'s own swipe-release logic (`SWIPE_MAX_DURATION_MS`, `SWIPE_MIN_DISTANCE_PX`, `SWIPE_MIN_VELOCITY_PX_MS` constants, combined with `&&`/`||` in its commit check) is the closest existing exemplar in this codebase for "distance OR velocity" gesture commit — match its constant-naming style (`DRAG_UP_COMMIT_VELOCITY_PX_MS`, following the same `_PX`/`_MS` suffix convention already used for `DRAG_UP_COMMIT_PX`).
- The `0.11` px/ms threshold is the exact value named in the loaded framework's momentum-dismissal guidance ("dismiss if velocity exceeds ~0.11") — use it verbatim, not `AlbumCoverFlow.tsx`'s own `SWIPE_MIN_VELOCITY_PX_MS` (which was tuned separately for a different gesture feel) — confirm this repo's actual constant name for that file's threshold doesn't get confused with this one; they are deliberately different components with independently-tunable thresholds.

## Steps

1. Open `src/components/site/ideas/IdeaFolderView.tsx` and locate the drag-start handler (wherever `dragStarted` is set true) — confirm whether a start timestamp is already tracked; if not, add one (e.g. `dragStartTimeRef.current = Date.now()` alongside whatever ref/state already tracks the start Y position).
2. Add the `DRAG_UP_COMMIT_VELOCITY_PX_MS = 0.11` constant near the existing `DRAG_UP_COMMIT_PX = 80` at line 8.
3. At the commit check (lines 301-321), compute `elapsedMs` and `velocity` as shown in Target, and change the `committed` condition to the OR form shown.
4. Confirm the existing distance-based path (`dy <= -DRAG_UP_COMMIT_PX`) is unchanged in behavior — this plan only adds an additional way to commit, it doesn't change the existing threshold.

## Boundaries

- Do NOT change `DRAG_UP_COMMIT_PX` itself (80px stays the distance-based threshold).
- Do NOT touch the downward/other-direction drag paths in the same file if they exist — this plan is scoped to the "drag up to return to stack" gesture only.
- Do NOT touch `AlbumCoverFlow.tsx` or `useSwipeGesture.ts` — they already implement velocity-based commit correctly and are referenced here only as an exemplar.
- If the actual commit-check code at lines 301-321 has a substantially different shape than described (drift since commit 46a1b7b), STOP and report the actual code rather than forcing this structure onto it.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/components/site/ideas/IdeaFolderView.tsx`, `npm run build` — all clean.
- **Feel check**: in a folder view (Liked/Disliked), perform a fast, short upward flick on a card (well under 80px of travel, but quick) and confirm it now commits the card back to the pending stack. Also perform a slow, deliberate drag past 80px and confirm the existing distance-based commit still works unchanged. Perform a slow drag that stays under 80px and confirm it does NOT commit (correctly rejected by both conditions).
- **Done when**: both a fast short flick and a slow long drag correctly commit the card, and a slow short drag correctly does not.
