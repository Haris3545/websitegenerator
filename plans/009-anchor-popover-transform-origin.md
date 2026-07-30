# 009 — Anchor 5 trigger-attached popovers to their transform-origin

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 5 files, 1-3 lines each

## Problem

Five popovers/dropdowns that visually attach to a specific trigger element have no `transform-origin` set (or, in three cases, no entrance transform at all) — they either default to `center` (wrong for a trigger-anchored element per the loaded rule) or teleport in with zero motion connecting them to their trigger.

```tsx
/* src/components/site/RestoreDeletedPopover.tsx:44 — current */
<div className="animate-poof-in absolute left-0 top-full z-30 mt-2 max-h-72 w-64 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-neutral-950/95 p-1.5 shadow-2xl backdrop-blur-md">
```
(`.animate-poof-in` does a full 2D scale from 0.92→1 with no `transform-origin`, defaulting to center — wrong for a popover anchored below-left of its trigger button.)

```tsx
/* src/components/site/DiscussionBoard.tsx:338 — current */
{emojiPickerPostId === post.id && (
  <div className="absolute left-0 top-full z-[60] mt-1 grid w-56 grid-cols-8 gap-1 rounded-xl border border-white/10 bg-neutral-950 p-2.5 shadow-2xl">
```
(No animation at all — appears instantly.)

```tsx
/* src/components/builder/ArtistForm.tsx:723 — current */
{channelDropdownOpen && (searchingChannels || channelResults.length > 0) && (
  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
```
(No animation at all.)

```tsx
/* src/components/builder/ColorField.tsx:62 — current */
<div className="absolute top-full z-10 mt-1">
  <HexColorPicker color={value} onChange={onChange} />
</div>
```
(No animation at all.)

```tsx
/* src/components/builder/HelpTooltip.tsx:29-31 — current */
<span
  role="tooltip"
  className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[11px] font-normal normal-case leading-snug text-neutral-600 shadow-lg transition-opacity duration-100 dark:border-white/15 dark:bg-neutral-900 dark:text-white/70 ${
    open ? "opacity-100" : "opacity-0"
  }`}
>
```
(Pure opacity fade with no initial transform — "pure-fade entrance with no initial transform" is explicitly named in the loaded AUDIT hunt-list.)

## Target

Each popover gets a small scale+opacity entrance anchored at the edge facing its trigger, using this repo's existing `dropdown-unfurl`/`dropdown-furl` vocabulary where the popover unfurls vertically, or a matching scale-from-edge treatment where it doesn't:

```tsx
/* target — RestoreDeletedPopover.tsx (opens below-left of its trigger) */
<div
  className="absolute left-0 top-full z-30 mt-2 max-h-72 w-64 origin-top-left overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-neutral-950/95 p-1.5 shadow-2xl backdrop-blur-md animate-poof-in"
>
```
(Adds Tailwind's `origin-top-left` utility — the popover already animates via `.animate-poof-in`'s scale; this just repoints where that scale originates from center to the top-left corner, matching its `left-0 top-full` trigger-relative position.)

```tsx
/* target — DiscussionBoard.tsx emoji picker (opens below-left of the "+" trigger) */
<div className="absolute left-0 top-full z-[60] mt-1 grid w-56 grid-cols-8 gap-1 origin-top-left rounded-xl border border-white/10 bg-neutral-950 p-2.5 shadow-2xl animate-dropdown-unfurl">
```
(Reuses the existing `dropdown-unfurl` keyframe already used elsewhere in this codebase for exactly this shape of trigger-anchored panel — see Repo conventions.)

```tsx
/* target — ArtistForm.tsx channel dropdown (opens below, full-width of its input) */
<div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 origin-top overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg animate-dropdown-unfurl dark:border-white/10 dark:bg-neutral-900">
```

```tsx
/* target — ColorField.tsx swatch picker (opens below its swatch button) */
<div className="absolute top-full z-10 mt-1 origin-top-left animate-dropdown-unfurl">
  <HexColorPicker color={value} onChange={onChange} />
</div>
```

```tsx
/* target — HelpTooltip.tsx (opens above its trigger, centered) */
<span
  role="tooltip"
  className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 origin-bottom -translate-x-1/2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[11px] font-normal normal-case leading-snug text-neutral-600 shadow-lg transition-[opacity,transform] duration-125 ease-out dark:border-white/15 dark:bg-neutral-900 dark:text-white/70 ${
    open ? "scale-100 opacity-100" : "scale-95 opacity-0"
  }`}
>
```
(Adds a `scale-95 → scale-100` component to the existing opacity fade, anchored at `origin-bottom` since the tooltip sits above and points down at its trigger; duration bumped from `duration-100` to the small-popover budget's `125`ms floor per AUDIT §2.)

## Repo conventions to follow

- `.animate-dropdown-unfurl`/`.animate-dropdown-furl` already exist in `src/app/globals.css` (used by `FontPicker.tsx`, `BackgroundMediaField.tsx`, `MonthCalendar.tsx`, `CampaignDateRangeField.tsx`) — reuse these classes rather than inventing new keyframes for the three popovers converting from "no animation" to "animated." Confirm the open/close-state pattern each of those existing call sites uses (a `closing` boolean swapping between `-unfurl`/`-furl`, likely via `useClosableOverlay` or a local equivalent) and match it, rather than only adding the entrance half.
- `RestoreDeletedPopover.tsx` already uses `.animate-poof-in` (a different, pre-existing class family used for card-delete/restore contexts elsewhere) — keep using it for consistency with its own restore-flow siblings, just add the origin utility rather than switching it to `dropdown-unfurl`.
- Tailwind's `origin-*` utilities (`origin-top-left`, `origin-top`, `origin-bottom`, etc.) are the standard way to set `transform-origin` in this codebase's Tailwind v4 setup — no custom CSS needed for any of these five.

## Steps

1. `src/components/site/RestoreDeletedPopover.tsx:44` — add `origin-top-left` to the className.
2. `src/components/site/DiscussionBoard.tsx:338` — add `origin-top-left animate-dropdown-unfurl` to the className; find how `emojiPickerPostId` closes (does it unmount immediately, or is there a closing-transition path?) via `grep -n "emojiPickerPostId" src/components/site/DiscussionBoard.tsx` — if it currently unmounts instantly with no exit path, wire in the same closing-delay pattern used by `FontPicker.tsx`/`MonthCalendar.tsx` (their existing `dropdown-furl` consumers) so open and close are both animated, not just open.
3. `src/components/builder/ArtistForm.tsx:723` — add `origin-top animate-dropdown-unfurl`; same check for how `channelDropdownOpen` closes.
4. `src/components/builder/ColorField.tsx:62` — add `origin-top-left animate-dropdown-unfurl`; same check for how `open` (from `useState` at line ~46 per plan 008) closes.
5. `src/components/builder/HelpTooltip.tsx:29-31` — replace the opacity-only conditional classes with the scale+opacity pair shown in Target, add `origin-bottom`, and change `transition-opacity duration-100` to `transition-[opacity,transform] duration-125 ease-out` (requires `--ease-out` from plan 001, or use the Tailwind `ease-out` utility keyword directly if simpler — confirm this component doesn't already reference the CSS var pattern before choosing).

## Boundaries

- Do NOT change the width/positioning offsets (`left-0`, `top-full`, `mt-1`/`mt-2`, etc.) of any of these five elements — only the origin/entrance animation.
- Do NOT modify `dropdown-unfurl`/`dropdown-furl`/`poof-in` keyframe definitions themselves.
- Do NOT add exit animation to any of the three "no animation at all" popovers if doing so would require a larger refactor of how their open/close boolean is managed than described in Steps 2-4 — if the close path can't be added cleanly within this plan's scope, land the entrance-only fix and note the exit gap as a follow-up rather than blocking on it.
- If any of the five files' cited lines have drifted since commit 46a1b7b, STOP and report rather than guessing.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint <all 5 files>`, `npm run build` — all clean.
- **Feel check**: open each of the five popovers (restore-deleted list on a Strategy/Research board, Discussion board emoji picker, YouTube channel search dropdown in the artist form, a color swatch picker, and any `HelpTooltip` in the artist form) and confirm each now visibly grows from the edge nearest its trigger rather than fading in from nowhere or scaling from its own center.
- **Done when**: all five have a correct `transform-origin` (via Tailwind `origin-*`) matching their trigger's position, and the three that previously had zero animation now visibly unfurl/scale in.
