# 001 — Introduce shared easing custom properties

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: HIGH
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`src/app/globals.css`), ~10 lines added, 0 removed

## Problem

No `--ease-*` CSS custom property exists anywhere in the repo (confirmed via `grep -rn "\-\-ease-" src` — zero matches). Every easing curve is a hand-typed literal, repeated verbatim across `src/app/globals.css` and duplicated independently in several `.tsx` files. This is the prerequisite fix for plan 002 (and any future easing fix) — without a token, fixing the wrong curve on one keyframe doesn't propagate anywhere else, and every future component reinvents the same string.

Current state, `src/app/globals.css:1-11`:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --foreground: #171717;
}
```

Current literal easing usage (12 occurrences of the entrance curve, 4 of the exit curve, verified via grep):

```css
/* src/app/globals.css:109 — current */
.animate-modal-in {
  animation: modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
/* src/app/globals.css:124 — current */
.animate-modal-out {
  animation: modal-out 0.18s cubic-bezier(0.4, 0, 1, 1) forwards;
}
```

## Target

Add a token block to `:root` in `src/app/globals.css`, right after the existing `--background`/`--foreground` declarations:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;

  /* Shared easing curves — see AUDIT.md §2/§7. Every hand-typed
     cubic-bezier() in this file and in component .tsx files should
     eventually reference one of these instead of repeating the literal. */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-in: cubic-bezier(0.55, 0.055, 0.675, 0.19);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

Do NOT repoint any existing keyframes at these tokens yet in this plan — that is plan 002's job (and future plans for the other categories that cite specific curves). This plan only introduces the tokens.

## Repo conventions to follow

- `:root` already exists at the top of `src/app/globals.css:8-11` — add the new custom properties there, in the same block, not a new one.
- The `@theme inline` block below it (`globals.css:13-21`) is Tailwind v4's own token wiring for colors/fonts and is a separate mechanism — do not add the easing tokens there; CSS custom properties consumed directly by `cubic-bezier()`/`transition` values belong in `:root`, not `@theme inline`.
- Match the existing comment style in the file: a short `/* ... */` block above new declarations explaining why, as seen throughout `globals.css` (e.g. the `.custom-scrollbar` comment at line 68, the `grain-shift` comment at line 49).

## Steps

1. Open `src/app/globals.css`. In the existing `:root { ... }` block (lines 8-11), after `--foreground: #171717;`, add the four custom properties shown in the Target section above, with the explanatory comment.
2. Do not modify any other line in this file in this plan.

## Boundaries

- Do NOT repoint `.animate-modal-in`, `.animate-modal-out`, or any other existing keyframe/class at the new tokens — that's plan 002.
- Do NOT touch any `.tsx` file.
- Do NOT add new dependencies.
- If `:root` no longer contains exactly `--background`/`--foreground` when you open the file (drift since commit 46a1b7b), STOP and report instead of improvising the insertion point.

## Verification

- **Mechanical**: `npx tsc --noEmit` (expect no errors — this is a CSS-only change), `npm run build` (expect a clean build; Tailwind v4 processes plain CSS custom properties in `:root` without any special step).
- **Feel check**: none required — this plan introduces no visible behavior change on its own. Confirm in DevTools that `:root` now computes `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` etc. via the Elements panel's Computed Styles tab on any page.
- **Done when**: the four custom properties exist in `:root` in `globals.css`, `npm run build` passes, and no visual regression exists anywhere in the app (since nothing yet references the new tokens).
