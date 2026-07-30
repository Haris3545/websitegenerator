# 006 — Drive Gantt/Timeline/ArtistsBoard drag visuals via transform instead of layout properties

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 3 files (`CampaignGanttBoard.tsx`, `CampaignTimeline.tsx`, `ArtistsBoard.tsx`), ~60 lines changed

## Problem

Three independent drag systems animate layout-triggering properties (`top`, `left`, `width`, `height`) directly during active pointer-driven drags, instead of a single `transform`. This is the worst place in the app for this pattern — active drags already compete for frame budget with the pointermove handler itself, and any dropped frame during a drag is maximally visible (the element visibly lags the pointer).

`src/components/site/CampaignGanttBoard.tsx:23` (constant) and its usage at lines 447/513 — row expand/collapse:
```tsx
/* CampaignGanttBoard.tsx:23 — current */
const ROW_HEIGHT_TRANSITION = "height 280ms cubic-bezier(0.16, 1, 0.3, 1)";
/* used at ~447/513 */
style={{ height: rowHeight(p.value), transition: ROW_HEIGHT_TRANSITION }}
```

`src/components/site/CampaignGanttBoard.tsx:604-614` — the drag-clone block that follows the pointer during a move:
```tsx
/* CampaignGanttBoard.tsx:604-614 — current */
style={{
  left: moveVisual.startIdx * DAY_WIDTH + 2,
  width: (moveVisual.endIdx - moveVisual.startIdx + 1) * DAY_WIDTH - 4,
  top: HEADER_TOTAL_HEIGHT + rowTops[moveVisual.pillar] + ROW_PADDING,
  height: LANE_HEIGHT,
  backgroundColor: "var(--accent)",
  transition: "top 140ms cubic-bezier(0.16, 1, 0.3, 1)",
}}
```

`src/components/site/CampaignTimeline.tsx:357-378` — milestone dot position during/after drag:
```tsx
/* CampaignTimeline.tsx:357-378 — current */
const left = isDragging ? dragVisual.left : dotLeft(i);
// ...
style={{ left, transition: isDragging ? "none" : "left 250ms ease" }}
```

`src/components/builder/ArtistsBoard.tsx:593-601` — the dragged artist ghost icon:
```tsx
/* ArtistsBoard.tsx:593-601 — current */
style={{
  left: dragPos.x - dragGrab.dx,
  top: dragPos.y - dragGrab.dy,
  transform: `rotate(${dragRotation}deg) scale(1.08)`,
  transition: "transform 150ms cubic-bezier(0.34, 1.2, 0.64, 1)",
}}
```

## Target

Each case converts its layout-property positioning into a `transform: translate3d(...)` (composed with any existing rotate/scale where present), computed relative to a fixed base position, and sets it directly via inline `style` rather than `left`/`top`/`width`/`height`.

Gantt row height — since a row's height genuinely changes the document flow of siblings below it (this is a real layout change, not just a visual offset), this one is the hardest to convert cleanly to pure transform; the pragmatic fix is a `clip-path: inset()` reveal on the row's content wrapper (matching this repo's `--ease-out` convention and the technique already named in this app's own AUDIT vocabulary) while the *row's own* height still changes normally but without a `transition` on `height` — i.e. stop animating `height` itself and instead reveal/hide the newly-visible content via `clip-path`:

```tsx
/* target — row wrapper: height still set directly (no transition), content clipped instead */
style={{ height: rowHeight(p.value) }}
/* target — inner content wrapper gets the animated clip */
style={{
  clipPath: isExpanded ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
  transition: "clip-path 280ms var(--ease-out)",
}}
```

Gantt drag-clone block — compute a fixed base `left`/`top`/`width`/`height` once per drag start, then drive only the delta via `transform`:
```tsx
/* target */
style={{
  left: baseLeft,      // computed once at drag start, not per-frame
  top: baseTop,
  width: blockWidth,
  height: LANE_HEIGHT,
  transform: `translate3d(${moveVisual.dx}px, ${moveVisual.dy}px, 0)`,
  backgroundColor: "var(--accent)",
  transition: "transform 140ms var(--ease-out)",
}}
```

Timeline dot — same technique, translate from a fixed base:
```tsx
/* target */
style={{
  transform: `translateX(${isDragging ? dragVisual.left : dotLeft(i)}px)`,
  transition: isDragging ? "none" : "transform 250ms var(--ease-out)",
}}
```
(Requires the dot's own base CSS to have `left: 0` and use `transform: translateX()` for its resting position too, not just during drag — see Steps.)

ArtistsBoard ghost — already 90% correct (uses `transform` for rotate/scale); fold `left`/`top` into the same transform string instead of separate style properties:
```tsx
/* target */
style={{
  transform: `translate3d(${dragPos.x - dragGrab.dx}px, ${dragPos.y - dragGrab.dy}px, 0) rotate(${dragRotation}deg) scale(1.08)`,
  transition: "transform 150ms cubic-bezier(0.34, 1.2, 0.64, 1)",
}}
```
(This ghost is `position: fixed` or `absolute` with `left: 0; top: 0` as its base — confirm the element's positioning context supports a pure-transform offset before removing `left`/`top` from the style object; if it's rendered inside a positioned ancestor at a non-zero offset, the base `left`/`top: 0` must be set once in the className/base style, not per-frame.)

## Repo conventions to follow

- `--ease-out` token from plan 001 should exist before this plan lands — use `var(--ease-out)` for the two `*.tsx` transitions above that currently say `cubic-bezier(0.16, 1, 0.3, 1)` or `ease` (Gantt drag-clone, Timeline dot). Plan 001 must land first.
- `AlbumCoverFlow.tsx:214-222` already sets `transform` directly (not via a CSS variable, not via `left`/`top`) during its own drag and disables the transition mid-drag (`transition: isDragging ? "none" : "..."`) — use this file as the exemplar pattern for "transform-only, transition-disabled-during-active-drag."

## Steps

1. **`ArtistsBoard.tsx` ghost (do this one first — smallest, most isolated change).** At lines 593-601, fold `left`/`top` into the existing `transform` string as shown in Target. Confirm the ghost element's own base positioning (className or surrounding style) sets `left: 0; top: 0` so the translate3d offset is the only thing moving it.
2. **`CampaignTimeline.tsx` dot.** At lines 357-378, change the dot's resting-state CSS from `left: <px>` to `transform: translateX(<px>)`, and update both the dragging and non-dragging branches of the ternary to set `transform` instead of `left`. Search the same file for any other place that reads/sets this dot's `left` (e.g. hit-testing math in the pointermove handler) — those calculations are unaffected since they're JS math, not CSS, but confirm no other code assumes `left` is the applied CSS property.
3. **`CampaignGanttBoard.tsx` drag-clone block.** At lines 604-614, compute `baseLeft`/`baseTop`/`blockWidth` once when the drag starts (wherever `moveVisual` is first set — find via `grep -n "setMoveVisual\|moveVisual =" src/components/site/CampaignGanttBoard.tsx`), store the deltas (`dx`, `dy`) as the values that change per pointermove instead of recomputing absolute `left`/`top` every event, and apply them via `transform: translate3d(...)` per Target.
4. **`CampaignGanttBoard.tsx` row height.** At lines 447/513, remove `transition: ROW_HEIGHT_TRANSITION` from the row wrapper's own `style` (height still changes, just without an animated transition on it) and add a `clip-path` transition to the row's inner content wrapper as shown in Target, gated on the same expand/collapse boolean the row height already reads.
5. Run `npx eslint` on all three files after each file's change, not just at the end, to catch unused-variable warnings early (e.g. `ROW_HEIGHT_TRANSITION` becoming dead code if fully removed — confirm whether it's still referenced elsewhere before deleting the constant itself).

## Boundaries

- Do NOT change any drag's hit-testing/row-detection math (`pillarFromClientY` and similar) — those operate on raw pointer coordinates, not on the animated visual properties, and are out of scope.
- Do NOT change the Gantt row's actual `rowHeight(p.value)` calculation — only how the height *change* is visually softened.
- Do NOT touch `AlbumCoverFlow.tsx` — it's already correct and is only referenced here as an exemplar.
- If `moveVisual`'s shape doesn't have separate `startIdx`/`endIdx`/`pillar` fields as described (drift since commit 46a1b7b), STOP and report the actual shape rather than inventing new fields.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint <all three files>`, `npm run build` — all clean.
- **Feel check**: with Chrome DevTools' Performance panel recording, drag a Gantt block across several days and several pillar rows continuously for ~3 seconds. Confirm:
  - Far fewer (ideally zero) "Layout" / "Recalculate Style" entries during the drag compared to before — dragging should show almost entirely "Composite Layers" work.
  - The block still visually tracks the pointer 1:1 with no added lag.
  - Expand/collapse a Gantt pillar row and confirm the reveal still looks smooth (content clips in/out) even though the row's own height change is no longer transitioned.
  - Drag a milestone dot on the Campaign Timeline to its full range in both directions and confirm no visual difference from before (should look identical, only implemented differently).
  - Drag an artist icon in the builder between folders and confirm the ghost still tracks the pointer with its existing rotate/scale wobble.
- **Done when**: all four call sites use `transform` instead of `top`/`left`/`width` for per-frame drag positioning, the Performance trace shows the drag now dominated by compositing rather than layout, and every drag interaction is visually indistinguishable from before the change at normal speed.
