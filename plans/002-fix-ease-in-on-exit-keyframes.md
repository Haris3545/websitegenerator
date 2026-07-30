# 002 — Fix ease-in curve on exit keyframes (modal/sheet/dropdown close)

- **Status**: DONE
- **Commit**: 46a1b7b
- **Severity**: HIGH
- **Category**: Easing & duration
- **Estimated scope**: 1 file (`src/app/globals.css`), 4 lines changed

## Problem

Four exit keyframes in `src/app/globals.css` use `cubic-bezier(0.4, 0, 1, 1)` — this is the `ease-in` shape (starts slow, delays the moment the user is watching). Per the loaded easing framework, both entering AND exiting elements should use `ease-out` ("Is the element entering or exiting? → ease-out"), and `ease-in` on UI is always a finding. These four classes back **every** modal, sheet, card-sheet, and dropdown close in both the site and the builder — this is the single highest-leverage easing fix in the app because of how many components share these four classes.

Confirmed via `grep -n "cubic-bezier(0.4, 0, 1, 1)" src/app/globals.css`:

```css
/* src/app/globals.css:122-125 — current */
@keyframes modal-out { /* ... */ }
.animate-modal-out {
  animation: modal-out 0.18s cubic-bezier(0.4, 0, 1, 1) forwards;
}

/* src/app/globals.css:152-155 — current */
.animate-sheet-out {
  animation: sheet-out 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
}

/* src/app/globals.css:185-188 — current */
.animate-card-sheet-out {
  animation: card-sheet-out 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
}

/* src/app/globals.css:379-381 — current */
.animate-dropdown-furl {
  animation: dropdown-furl 0.15s cubic-bezier(0.4, 0, 1, 1) forwards;
}
```

## Target

Replace `cubic-bezier(0.4, 0, 1, 1)` with `var(--ease-out)` in all four declarations:

```css
/* target */
.animate-modal-out {
  animation: modal-out 0.18s var(--ease-out) forwards;
}
.animate-sheet-out {
  animation: sheet-out 0.2s var(--ease-out) forwards;
}
.animate-card-sheet-out {
  animation: card-sheet-out 0.2s var(--ease-out) forwards;
}
.animate-dropdown-furl {
  animation: dropdown-furl 0.15s var(--ease-out) forwards;
}
```

Durations (0.18s, 0.2s, 0.2s, 0.15s) are unchanged — all already comfortably inside the modal/drawer (200-500ms) or dropdown (150-250ms) budgets. This plan changes the easing function only.

## Repo conventions to follow

- **Requires plan 001 to be applied first** — this plan assumes `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` already exists in `:root`. If it doesn't, STOP and apply plan 001 first.
- The four matching entrance classes (`.animate-modal-in`, `.animate-sheet-in`, `.animate-card-sheet-in`, `.animate-dropdown-unfurl`) already correctly use `cubic-bezier(0.16, 1, 0.3, 1)` — a separate, stronger ease-out curve. This plan does NOT touch those or attempt to unify the two ease-out curves; that's a separate consolidation decision outside this plan's scope. Only the exit classes' wrong easing *category* (ease-in vs ease-out) is being fixed here, via the token introduced in plan 001.

## Steps

1. Open `src/app/globals.css`. At line 124, change `cubic-bezier(0.4, 0, 1, 1)` to `var(--ease-out)` in the `.animate-modal-out` rule.
2. At line 154, make the same change in `.animate-sheet-out`.
3. At line 187, make the same change in `.animate-card-sheet-out`.
4. At line 381, make the same change in `.animate-dropdown-furl`.
5. Do not modify the `@keyframes` blocks themselves (`modal-out`, `sheet-out`, `card-sheet-out`, `dropdown-furl`) — only the `animation:` shorthand lines that reference them.

## Boundaries

- Do NOT touch the four `*-in` entrance classes or their `cubic-bezier(0.16, 1, 0.3, 1)` curve.
- Do NOT change any duration value.
- Do NOT touch any `.tsx` file — these classes are applied via `className` strings elsewhere but no call site needs to change.
- If line numbers have drifted since commit 46a1b7b (the four rules no longer read `cubic-bezier(0.4, 0, 1, 1)`), STOP and report instead of guessing which rule was intended.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run build` — both should pass cleanly (CSS-only change).
- **Feel check**: open any modal in the builder (e.g. click "+ New artist" then Cancel) and any dropdown (e.g. the color picker in `ArtistForm`) and close each. In Chrome DevTools' Animations panel, set playback to 10% and confirm:
  - The close motion now decelerates into its resting/hidden state the same way the open motion accelerates out of it — no more slow-start-then-rush feeling on close.
  - Compare before/after by temporarily reverting one rule and toggling — the difference should be perceptible even at 100% speed on the sheet variants (200ms) since ease-in vs ease-out is most visible on entrances/exits, not mid-motion moves.
- **Done when**: all four exit classes reference `var(--ease-out)`, the build is clean, and closing a modal/sheet/dropdown anywhere in the app (both site and builder) visibly decelerates rather than delaying its initial movement.
