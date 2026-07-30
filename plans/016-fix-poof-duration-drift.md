# 016 — Fix poof-particle JS/CSS duration drift

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`src/hooks/usePoofEffect.tsx`), 1 line

## Problem

`src/hooks/usePoofEffect.tsx:8` and `src/app/globals.css:231` independently hand-type what's meant to be the same duration, and they've drifted apart:

```ts
/* src/hooks/usePoofEffect.tsx:8 — current */
const POOF_DURATION_MS = 550;
```

```css
/* src/app/globals.css:231 — current */
.animate-poof-particle {
  animation: poof-particle 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

```ts
/* src/hooks/usePoofEffect.tsx:28 — current */
animationDelay: `${i * 0.01}s`, // per-particle stagger, up to i=7 → 70ms
```

The 8th particle (`i=7`) starts 70ms late and runs for the CSS's 500ms, finishing at 570ms — but the JS cleanup timeout unmounts the whole burst at 550ms, cutting that particle's animation off ~20ms early.

## Target

```ts
/* target — usePoofEffect.tsx */
const PARTICLE_COUNT = 8; // confirm actual current value on open
const PARTICLE_STAGGER_MS = 10;
const PARTICLE_ANIMATION_MS = 500; // must match .animate-poof-particle's own duration in globals.css
const POOF_DURATION_MS = PARTICLE_ANIMATION_MS + (PARTICLE_COUNT - 1) * PARTICLE_STAGGER_MS; // 570
```

This makes the cleanup timeout a computed value derived from the actual per-particle animation duration and stagger, rather than a separately-guessed round number — so if either the CSS duration or the stagger/count ever changes again, `POOF_DURATION_MS` stays correct automatically instead of needing a second manual update.

## Repo conventions to follow

- Match this file's existing constant-naming style (`SCREAMING_SNAKE_CASE` with a `_MS` suffix, as already used for `POOF_DURATION_MS` itself).
- Confirm the actual current particle count and stagger increment on open — the audit cited `i * 0.01s` up to `i=7`, implying 8 particles, but verify against the actual array/loop bounds in the file rather than assuming.

## Steps

1. Open `src/hooks/usePoofEffect.tsx` and confirm the actual particle count (how many particles the burst creates) and the stagger increment (`0.01s` = `10ms` per the audit).
2. Confirm `src/app/globals.css:231`'s `.animate-poof-particle` duration (`0.5s` = `500ms` per the audit).
3. Replace the standalone `POOF_DURATION_MS = 550` literal with the computed form shown in Target, deriving it from explicit `PARTICLE_COUNT`/`PARTICLE_STAGGER_MS`/`PARTICLE_ANIMATION_MS` constants (the last one commented to note it must match `globals.css`'s own value, since there's no automated way to share a literal between a `.ts` file and a `.css` file in this codebase).
4. Confirm the per-particle `animationDelay` calculation at line 28 uses the same `PARTICLE_STAGGER_MS` constant rather than a separate hardcoded `0.01`.

## Boundaries

- Do NOT change the CSS animation duration (`0.5s`) or easing in `globals.css` — only the JS cleanup timing derivation.
- Do NOT change the visual stagger amount or particle count — only make the existing values explicit named constants that the cleanup timeout is computed from.
- If the actual particle count/stagger in the file differs from what's described here (drift since commit 46a1b7b), STOP and report the actual values rather than forcing this exact math.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/hooks/usePoofEffect.tsx`, `npm run build` — all clean.
- **Feel check**: delete a Discussion post (or any board card using this effect) and watch the particle burst in DevTools' Animations panel at 10% playback. Confirm every particle, including the last-staggered one, completes its full animation before the burst unmounts — no particle should visibly cut off or flicker away early.
- **Done when**: `POOF_DURATION_MS` is a computed value tied to the actual CSS duration and stagger constants, and the last particle in the burst always finishes its full animation before cleanup fires.
