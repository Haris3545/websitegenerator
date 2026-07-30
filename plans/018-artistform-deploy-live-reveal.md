# 018 — Animate the "Live." deploy-status reveal in ArtistForm

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: LOW (missed opportunity — additive, not corrective)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`src/components/builder/ArtistForm.tsx`), ~8 lines

## Problem

`src/components/builder/ArtistForm.tsx:1097-1099` (the `deployStatus === "ready"` branch, per the missed-opportunities audit) swaps in a plain color change with zero motion, despite the surrounding UI's own copy describing this as a can-only-happen-once-per-artist event:

```tsx
/* ArtistForm.tsx:1097-1099 — current (paraphrased from the audit; verify exact JSX on open) */
{deployStatus === "ready" && (
  <span className="text-emerald-600">Live.</span>
)}
```

## Target

A small `clip-path` sweep-in, within the dropdown/select duration budget (150-250ms) since this is a short inline status word, not a whole-surface reveal:

```tsx
/* target */
{deployStatus === "ready" && (
  <span
    className="inline-block text-emerald-600"
    style={{
      clipPath: "inset(0 0 0 0)",
      animation: "deploy-live-reveal 200ms var(--ease-out)",
    }}
  >
    Live.
  </span>
)}
```

```css
/* target — add near the other small keyframes in src/app/globals.css */
@keyframes deploy-live-reveal {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0 0 0 0); }
}
```

## Repo conventions to follow

- Requires `--ease-out` from plan 001; if not yet landed, use `cubic-bezier(0.16, 1, 0.3, 1)` directly as a fallback rather than blocking this plan on it.
- Match this file's existing pattern of conditional-render + Tailwind className (seen throughout `ArtistForm.tsx`) — the only change here is adding the keyframe animation, not restructuring the conditional.

## Steps

1. Open `src/components/builder/ArtistForm.tsx` and locate the `deployStatus === "ready"` branch (around line 1097).
2. Wrap the "Live." text in the `clip-path`-animated span shown in Target, adding `inline-block` (required for `clip-path` to apply predictably to inline content).
3. Add the `deploy-live-reveal` keyframe to `src/app/globals.css`, placed near the file's other small state-change keyframes (e.g. near `hint-pulse`).

## Boundaries

- Do NOT change the deploy-status state machine or any other branch of the conditional (`idle`/`deploying`/`error` states, if they exist) — only the `"ready"` branch's visual entrance.
- Do NOT add this same treatment anywhere else in the file — scope is exactly this one status reveal.
- If the actual JSX at this location differs substantially from the paraphrased excerpt above (drift since commit 46a1b7b), STOP and report the actual code rather than guessing its shape.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/components/builder/ArtistForm.tsx`, `npm run build` — all clean.
- **Feel check**: trigger a deploy in the builder (or simulate `deployStatus` reaching `"ready"` in dev) and confirm "Live." now sweeps in left-to-right rather than popping in instantly.
- **Done when**: the reveal plays once when `deployStatus` first reaches `"ready"`, completes within 200ms, and no other part of the deploy-status UI is affected.
