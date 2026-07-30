# 007 — Reduce animation on the app's highest-frequency action (tab switching)

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 2 files (`src/app/globals.css`, `src/components/site/NavPills.tsx`), ~10 lines changed

## Problem

Switching between the ~13 site tabs is the single most-triggered action in the app — the purpose-and-frequency audit named it explicitly as the closest thing to a "tens of times/day" surface this app has. Two separate animations currently stack on every switch:

`src/app/globals.css:32-45`:
```css
/* current */
@keyframes tab-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-tab-in {
  animation: tab-in 0.25s ease-out;
}
```
Applied to the whole tab content on every navigation (per `src/components/site/PageTransition.tsx`, which remounts a keyed wrapper and replays this on every switch).

`src/components/site/NavPills.tsx:90`:
```tsx
/* current */
className={`block whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-150 ease-out hover:-translate-y-0.5 ${...}`}
```
The pill itself lifts on hover in addition to the content fade-in below it — two motion effects on the same action.

Per the loaded frequency table, "tens of times/day" should be "removed or drastically reduced," not treated as occasional. The pill's own active/inactive background color already communicates which tab is selected without any added motion.

## Target

Shorten and de-emphasize the content transition rather than removing it outright (a bare instant swap on every navigation can itself read as jarring — see AUDIT §8's "preventing a jarring change"), and drop the redundant pill hover-lift since the color change alone already gives feedback:

```css
/* target — src/app/globals.css */
@keyframes tab-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.animate-tab-in {
  animation: tab-in 0.12s var(--ease-out);
}
```

```tsx
/* target — NavPills.tsx:90 — drop hover:-translate-y-0.5, keep the color transition */
className={`block whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${...}`}
```

The `translateY(6px)` component is removed entirely (opacity-only is the "near-imperceptible" treatment the frequency table allows for this tier), and duration drops from 250ms to 120ms — still enough to soften the swap without reading as a deliberate entrance.

## Repo conventions to follow

- Requires plan 001 (`--ease-out` token) to land first.
- This mirrors the exact reasoning already used elsewhere in this session's history for the ArtistsBoard double-click / drag-vs-click distinctions: keep the minimum motion that prevents a jarring change, cut everything else. Don't remove `.animate-tab-in` entirely — a hard instant swap on navigation was explicitly identified by the app's own history (see `PageTransition.tsx`'s existence) as something worth softening; this plan only rebalances how much.

## Steps

1. In `src/app/globals.css`, edit the `@keyframes tab-in` block (lines 32-39) to remove both `transform: translateY(6px)` (from) and `transform: translateY(0)` (to) — opacity only.
2. In the same file, edit `.animate-tab-in` (lines 43-45) to change `0.25s ease-out` to `0.12s var(--ease-out)`.
3. In `src/components/site/NavPills.tsx` at line 90, remove `hover:-translate-y-0.5` from the className string and change `transition-all` to `transition-colors` (the pill has no other animated property once the lift is gone — confirm by reading the full className string before assuming `transition-colors` is sufficient; if another hover effect exists in the same string, keep the transition scoped to cover it too).

## Boundaries

- Do NOT remove `.animate-tab-in`/`PageTransition.tsx` entirely — only shorten and simplify it.
- Do NOT change the pill's active-state background color logic — only the hover motion.
- Do NOT touch any other `hover:-translate-y-0.5` occurrence in the codebase (KpiCard, ArticleCard, etc.) — those are separate findings (see plan 008/009's sibling scope) and not part of this plan.
- If `NavPills.tsx:90`'s className string has drifted to include additional classes not shown here, STOP and report the actual string rather than guessing what else might need `transition-colors` scoping.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/components/site/NavPills.tsx`, `npm run build` — all clean.
- **Feel check**: click through several site tabs in quick succession (Dashboard → Media → Music → YouTube → back to Dashboard). Confirm:
  - The content still softens in rather than hard-cutting, but the effect is fast enough to feel invisible during rapid switching rather than like a deliberate animation.
  - The nav pill itself no longer lifts on hover — only its background/text color changes.
  - Rapidly hovering across all pills in a row (mouse sweep) feels calmer than before, with no stacked lift+fade motion.
- **Done when**: `tab-in` is opacity-only at 120ms, the nav pill hover lift is gone, and switching tabs no longer reads as an animated event — it should feel closer to "instant with the edges softened" than "an entrance."
