# 008 — Add :active press feedback to 14 pressable elements with none

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 12 files, 1-3 lines each

## Problem

14 pressable elements across both apps have no `:active`/press-feedback state at all — hover styling exists in most, but nothing confirms to the user that a press was registered. All share the same fix pattern, so this is one plan covering all of them (per this skill's own merge guidance for identical fixes across files).

```tsx
/* src/components/site/DiscussionBoard.tsx:332 — current */
<button
  type="button"
  onClick={() => setEmojiPickerPostId((id) => (id === post.id ? null : post.id))}
  className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-xs text-white/40 transition-colors hover:border-white/25 hover:text-white/70"
  aria-label="Add reaction"
>

/* src/components/builder/ThemeToggle.tsx:41 — current */
className="fixed bottom-5 right-5 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-lg text-neutral-600 shadow-lg transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-white/70 dark:hover:bg-neutral-800"

/* src/components/builder/ArtistsBoard.tsx:549 — current */
className="absolute -right-1.5 -top-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100"

/* src/components/builder/ArtistsBoard.tsx:500 — current */
className={`flex w-24 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors ${
  dropTarget === `folder:${folder.id}` ? "bg-builder-accent/10 ring-2 ring-builder-accent" : "hover:bg-black/[0.03] dark:hover:bg-white/5"
}`}

/* src/components/builder/ColorField.tsx:46 — current */
<button
  type="button"
  onClick={() => setOpen((o) => !o)}
  className="h-8 w-8 rounded-lg border border-neutral-300 shadow-inner dark:border-white/15"
  style={{ backgroundColor: value }}
  aria-label={`Pick ${label}`}
/>

/* src/components/site/LocationPinMap.tsx:107 — current */
className={`h-6 w-6 rounded-full transition-transform duration-150 ease-out hover:scale-110 ${
  value === c ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-neutral-950" : ""
}`}

/* src/components/site/LocationPinMap.tsx:421 — current */
className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 ease-out ${
  placing
    ? "animate-hint-pulse bg-[var(--accent)] text-black"
    : "border border-white/20 text-white/80 hover:-translate-y-0.5 hover:border-white/40"
}`}

/* src/components/site/ideas/IdeaFolderView.tsx:48-51 — current */
<div
  className={`relative aspect-[3/4] touch-none select-none overflow-hidden rounded-xl shadow-lg shadow-black/30 transition-opacity duration-150 ${
    selectMode && !faded ? "animate-jiggle" : ""
  } ${faded ? "opacity-25" : ""}`}

/* src/components/site/NavPills.tsx:90 — current (post-plan-007, "transition-colors duration-150", still no :active) */

/* src/components/builder/ThemeEditor.tsx:276 — current */
className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
  selected === tab.id
    ? "border-builder-accent bg-builder-accent text-black"
    : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
}`}

/* src/components/builder/ProvisioningOverlay.tsx:267-272 — current */
<button
  type="button"
  onClick={onComplete}
  className="rounded-full bg-builder-accent px-6 py-2.5 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5"
>
  Continue now
</button>

/* src/app/builder/login/page.tsx:170-174 — current */
<button
  type="submit"
  disabled={loading}
  className="rounded-lg bg-builder-accent px-3 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:brightness-95 disabled:opacity-50"
>

/* src/components/site/CampaignGanttBoard.tsx:469 (also 488, 562) — current */
className="flex cursor-grab border-b border-white/10 active:cursor-grabbing"
```

## Target

Add `active:scale-97` (Tailwind arbitrary value `active:scale-[0.97]` since `97` isn't a default Tailwind scale step) plus a `transform`-covering transition to each element's className. Where an element already has `hover:-translate-y-0.5` or `hover:scale-110`, the active state should still read as a *press* (scale down from whatever the current hover state is), so add it as an additional utility rather than replacing the hover one:

```tsx
/* target pattern, applied per element above */
className="... transition-transform duration-150 ease-out active:scale-[0.97] ..."
```

For elements using `transition-colors` or `transition-opacity` only, add `transform` to the transitioned properties (e.g. `transition-[color,transform]` or split into two Tailwind transition utilities) so the press scale is actually eased rather than snapping.

For `CampaignGanttBoard.tsx`'s three drag-handle rows (lines 469/488/562), which are `cursor-grab` elements rather than buttons, add the same `active:scale-[0.97] transition-transform duration-150 ease-out` — a drag handle benefits from press feedback exactly as much as a button does, confirming a press was registered before the drag threshold is crossed.

## Repo conventions to follow

- This repo already uses `active:scale-90`/`active:scale-95` in a couple of places (e.g. `DiscussionBoard.tsx:322`'s reaction pill) — use `active:scale-[0.97]` specifically per the AUDIT target range (0.95–0.98), not the more aggressive `scale-90`/`scale-95` already seen elsewhere; those are a separate, out-of-scope inconsistency (not part of this plan).
- Tailwind v4 in this project supports arbitrary bracket values (`scale-[0.97]`) — confirmed by existing usage of similar bracket syntax elsewhere in the codebase (e.g. `ring-offset-2` computed classes, `shadow-[0_0_28px_var(--accent)]` in `KpiCard.tsx`).

## Steps

1. `src/components/site/DiscussionBoard.tsx:332` — add `active:scale-[0.97] transition-transform duration-150 ease-out` alongside the existing `transition-colors`.
2. `src/components/builder/ThemeToggle.tsx:41` — same addition.
3. `src/components/builder/ArtistsBoard.tsx:549` — same addition (keep the existing `transition-opacity duration-150` for the hover-reveal, add a separate `transition-transform duration-150 ease-out active:scale-[0.97]`).
4. `src/components/builder/ArtistsBoard.tsx:500` — same addition.
5. `src/components/builder/ColorField.tsx:46` — same addition (this button currently has zero transition classes at all; add both hover and active feedback minimally: `transition-transform duration-150 ease-out active:scale-[0.97]`).
6. `src/components/site/LocationPinMap.tsx:107` — add `active:scale-[0.97]` (already has `transition-transform duration-150 ease-out`, just needs the active variant added to the existing transition).
7. `src/components/site/LocationPinMap.tsx:421` — add `active:scale-[0.97]` (already has `transition-all duration-150 ease-out`, which covers transform).
8. `src/components/site/ideas/IdeaFolderView.tsx:48-51` — add `active:scale-[0.97] transition-transform duration-150 ease-out` (careful: this element also conditionally gets `animate-jiggle` — confirm the two don't conflict by testing select-mode with an active press; if they visually fight, scope the `active:scale-[0.97]` to only apply when `!selectMode`).
9. `src/components/site/NavPills.tsx:90` (post plan-007 edit) — add `active:scale-[0.97]` alongside `transition-colors`; since scaling a nav pill needs `transform` in the transition list too, change to `transition-[color,transform] duration-150 ease-out` or add a second Tailwind transition utility.
10. `src/components/builder/ThemeEditor.tsx:276` — add `active:scale-[0.97] transition-transform duration-150 ease-out`.
11. `src/components/builder/ProvisioningOverlay.tsx:267-272` — add `active:scale-[0.97]` (already has `transition-transform duration-150 ease-out`).
12. `src/app/builder/login/page.tsx:170-174` — add `active:scale-[0.97]` (already has `transition-transform duration-150 ease-out`).
13. `src/components/site/CampaignGanttBoard.tsx:469,488,562` — add `active:scale-[0.97] transition-transform duration-150 ease-out` to all three drag-handle row elements.

## Boundaries

- Do NOT change any element's hover behavior, color, or existing transform values beyond adding the active-scale utility.
- Do NOT touch `DiscussionBoard.tsx:322`'s existing `active:scale-90` reaction pill — that's a separate, already-animated element outside this plan's list.
- Do NOT add press feedback to any element not explicitly listed above — this plan's scope is exactly these 14 sites, not a general sweep.
- If any listed line no longer matches the className shown (drift since commit 46a1b7b), STOP and report that specific site rather than guessing where in a changed className to insert the new utility.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint <all 12 touched files>`, `npm run build` — all clean.
- **Feel check**: click-and-hold (don't release) each of the 14 elements in turn and confirm a visible, subtle scale-down while held, releasing back to full size on mouseup. In DevTools' Animations panel at 10% playback on one example (e.g. the login submit button), confirm the scale change is smooth over ~150ms, not instant.
- **Done when**: all 14 sites show a `scale(0.97)` press state with a 150ms ease-out transition, and no existing hover/drag behavior regressed.
