# 019 — Animate the Ideas tab's "No ideas left to review" empty state

- **Status**: DONE
- **Commit**: 46a1b7b
- **Severity**: LOW (missed opportunity — additive, not corrective)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`src/components/site/ideas/SwipeStack.tsx`), ~5 lines

## Problem

`src/components/site/ideas/SwipeStack.tsx:69-75` (per the missed-opportunities audit) renders the fully-flat empty state once a user has swiped through every pending idea, despite this app already having a rich delight vocabulary (`poof-in`, `jiggle`, `hint-pulse`) used elsewhere for exactly this kind of rare, end-of-flow moment:

```tsx
/* SwipeStack.tsx:69-75 — current (paraphrased; verify exact JSX on open) */
<p className="text-center text-sm text-white/50">No ideas left to review</p>
```

## Target

A `translateY(100%)`-based slide entrance (own-height-relative, per the loaded framework's named technique) combined with a fade, within the UI budget (≤300ms):

```tsx
/* target */
<p className="animate-empty-state-in text-center text-sm text-white/50">
  No ideas left to review
</p>
```

```css
/* target — add near the other keyframes in src/app/globals.css */
@keyframes empty-state-in {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-empty-state-in {
  animation: empty-state-in 0.25s var(--ease-out);
}
```

## Repo conventions to follow

- `translateY(100%)` is deliberately a percentage (the element's own height), matching this app's own AUDIT §8 guidance and the pattern already used correctly elsewhere in this codebase for toast/sheet entrances — do not hardcode a pixel offset.
- Requires `--ease-out` from plan 001; fall back to `cubic-bezier(0.16, 1, 0.3, 1)` directly if plan 001 hasn't landed yet.

## Steps

1. Open `src/components/site/ideas/SwipeStack.tsx` and locate the empty-state JSX (around lines 69-75).
2. Add the `animate-empty-state-in` className to the empty-state container (the `<p>` or its wrapping element, whichever makes more sense given the surrounding layout — check if there's a wrapping `<div>` with padding/centering that should carry the animation instead of the bare text element).
3. Add the `empty-state-in` keyframe and `.animate-empty-state-in` class to `src/app/globals.css`.

## Boundaries

- Do NOT change the empty-state's copy, layout, or the logic determining when it renders — only its entrance.
- Do NOT reuse this exact treatment elsewhere without a separate finding — this plan is scoped to this one empty state.
- If the empty-state JSX has a substantially different structure than described (drift since commit 46a1b7b), STOP and report rather than guessing.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/components/site/ideas/SwipeStack.tsx`, `npm run build` — all clean.
- **Feel check**: swipe through every idea in a test artist's stack until it's empty, and confirm the empty-state message now slides up and fades in rather than appearing instantly.
- **Done when**: the empty state animates in once, within 250ms, on every occurrence of the stack becoming empty (including if the user adds and then re-swipes through new ideas in the same session).
