# 017 — Animate the ProvisioningOverlay completion moment

- **Status**: DONE (plan 015 was dropped, so used the local-keyframe fallback path described in this plan)
- **Commit**: 46a1b7b
- **Severity**: MEDIUM (missed opportunity — additive, not corrective)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`src/components/builder/ProvisioningOverlay.tsx`), ~10 lines

## Problem

`src/components/builder/ProvisioningOverlay.tsx:222-274` (the `phase === "done"` UI) is the single moment a brand-new artist's site finishes provisioning — a genuine, rare, once-per-artist success beat (per the component's own code comments, referenced by the missed-opportunities audit). It currently renders with zero motion: the "Dashboard ready" text and "Continue now" button just appear the instant `phase` flips, no different from any intermediate loading-state change.

```tsx
/* ProvisioningOverlay.tsx:267-272 — current */
<button
  type="button"
  onClick={onComplete}
  className="rounded-full bg-builder-accent px-6 py-2.5 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5"
>
  Continue now
</button>
```

## Target

A `clip-path: inset()` reveal on the button as it mounts, matching the technique this app's own AUDIT vocabulary names for exactly this kind of moment, within the modal/drawer duration budget (200-500ms) since this is a once-per-artist "arrival" beat, not routine UI:

```tsx
/* target */
<button
  type="button"
  onClick={onComplete}
  className="animate-list-item-in rounded-full bg-builder-accent px-6 py-2.5 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
  style={{ animationDelay: "150ms" }}
>
  Continue now
</button>
```

(Reuses the `.animate-list-item-in` utility from plan 015 if that plan has already landed; if not, use a one-off local entrance: `opacity: 0, transform: scale(0.95)` → `opacity: 1, transform: scale(1)` over 300ms `var(--ease-out)`, since a `clip-path` reveal on a small pill-shaped button reads awkwardly compared to a scale+fade — reserve `clip-path` reveals for the wider "Dashboard ready" text/checklist region instead, per the more literal application below.)

Apply the same treatment to the surrounding "Dashboard ready" status text at the top of the `phase === "done"` block, so the whole completion state arrives as one coordinated beat rather than the button alone:

```tsx
/* target — status text, wherever "Dashboard ready" is rendered in the phase==="done" branch */
<p className="animate-list-item-in text-center text-sm font-medium text-white">
  Dashboard ready
</p>
```

## Repo conventions to follow

- If plan 015 (entrance stagger) has landed, reuse its `.animate-list-item-in` class and `--ease-out` token directly rather than duplicating a new keyframe.
- If plan 015 has NOT landed, add a minimal local keyframe scoped to this file's needs only (do not block this plan on plan 015).
- `active:scale-[0.97]` on the button matches plan 008's pattern if that's landed; if not, this plan can add it standalone since it's a one-line addition consistent with the rest of the button's existing `transition-transform`.

## Steps

1. Open `src/components/builder/ProvisioningOverlay.tsx` and locate the `phase === "done"` JSX block (around lines 222-274).
2. Check whether `.animate-list-item-in` (from plan 015) already exists in `globals.css`. If yes, apply it with a staggered `animationDelay` to both the "Dashboard ready" text and the "Continue now" button (text first, button ~150ms after). If no, add a small local `@keyframes provisioning-done-in` (opacity 0→1, scale 0.95→1, 300ms `var(--ease-out)` or `cubic-bezier(0.16, 1, 0.3, 1)` if the token from plan 001 hasn't landed) and a matching `.animate-provisioning-done-in` class, applied the same way.
3. Add `active:scale-[0.97]` to the "Continue now" button if not already present via plan 008.

## Boundaries

- Do NOT change the 1400ms auto-advance timer or any other provisioning logic — this plan is purely about the visual entrance of the completion state.
- Do NOT add animation to the intermediate "running"/"checking" phase's checklist rows — that's plan 015's broader scope (list stagger), not this plan's.
- If the `phase === "done"` JSX structure has changed substantially since commit 46a1b7b, STOP and report the actual structure rather than forcing this exact insertion.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/components/builder/ProvisioningOverlay.tsx`, `npm run build` — all clean.
- **Feel check**: create a new artist end-to-end (or trigger `mode="refresh"` on an existing one) and watch the overlay reach `phase === "done"`. Confirm the "Dashboard ready" text and button now visibly arrive with a brief, coordinated motion rather than popping in instantly, and confirm the button's existing hover-lift and new press-feedback still work.
- **Done when**: the completion moment reads as a deliberate beat distinct from the preceding loading states, still lands well within the 1400ms auto-advance window, and the button remains fully clickable throughout (never gated behind the animation).
