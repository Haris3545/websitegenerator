# 003 — Fix scale(0) entrance keyframes (poof-particle, pin-drop-in)

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 1 file (`src/app/globals.css`), 2 lines changed

## Problem

Two keyframes animate to/from a literal `scale(0)`. Per the loaded physicality rule: "Never `scale(0)` — nothing in the real world appears from nothing." Confirmed via `grep -n "scale(0)" src/app/globals.css`:

```css
/* src/app/globals.css:225-232 — current, poof-particle (used on delete/add across
   Discussion posts, Tactics/Strategy/Research board cards, Ideas cards) */
@keyframes poof-particle {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(var(--poof-x), var(--poof-y)) scale(0);
    opacity: 0;
  }
}

/* src/app/globals.css:248-256 — current, pin-drop-in (used on new Locations map pins) */
@keyframes pin-drop-in {
  0% {
    transform: scale(0) translateY(-14px);
    opacity: 0;
  }
  60% {
    transform: scale(1.25) translateY(0);
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
```

## Target

```css
/* target */
@keyframes poof-particle {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(var(--poof-x), var(--poof-y)) scale(0.92);
    opacity: 0;
  }
}

@keyframes pin-drop-in {
  0% {
    transform: scale(0.9) translateY(-14px);
    opacity: 0;
  }
  60% {
    transform: scale(1.25) translateY(0);
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
```

`poof-particle`'s `scale(0)` is on the *exit* side (particle shrinking away on delete) — target range `0.9–0.97` still applies per the rule; `0.92` keeps a faint, still-visible shape as it fades rather than vanishing to nothing. `pin-drop-in`'s `scale(0)` is on the *entrance* side — `0.9` keeps the same "small but present" starting shape before the bounce to `1.25` and settle to `1`.

## Repo conventions to follow

- These are the only two `scale(0)` occurrences in the codebase (confirmed via repo-wide grep) — no other keyframe or inline style needs this fix.
- `pin-drop-in`'s existing overshoot (`60% { scale(1.25) }`) and bounce easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`, applied at its call site `.animate-pin-drop-in`) are unrelated to this finding and must not be changed — only the starting `scale(0)` value.

## Steps

1. Open `src/app/globals.css`. At line 227 (`100%` block of `@keyframes poof-particle`), change `scale(0)` to `scale(0.92)`.
2. At line 249 (`0%` block of `@keyframes pin-drop-in`), change `scale(0)` to `scale(0.9)`.
3. Do not touch any other line in either keyframe block.

## Boundaries

- Do NOT change the `translate`/`translateY` values, the `opacity` values, the `60%`/`100%` keyframe stops, or the classes' `animation:` shorthand (duration/easing) in either block.
- Do NOT touch any `.tsx` file — both keyframes are applied purely via CSS classes already wired up correctly.
- If either keyframe no longer contains `scale(0)` at the cited line when you open the file, STOP and report instead of guessing which value changed.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run build` — both should pass cleanly.
- **Feel check**:
  - Delete a Discussion post (or any Tactics/Strategy/Research board card) and watch the poof-particle burst in DevTools' Animations panel at 10% playback — particles should now shrink to a small but still-visible dot rather than disappearing to a literal point at the very end.
  - Add a new pin on the Locations map (or trigger `justAdded` styling) and confirm the pin still visibly "pops" in with the same bounce feel as before — the only difference should be that its very first frame shows a small pin shape instead of nothing.
- **Done when**: both `scale(0)` occurrences are gone from `globals.css`, the build is clean, and both animations retain their original bounce/timing feel with only the starting/ending scale floor raised.
