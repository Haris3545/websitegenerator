# 020 — Animate the ConversationThemes quote accordion open/close

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: MEDIUM (missed opportunity — additive, not corrective)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`src/components/site/ConversationThemes.tsx`), ~10 lines

## Problem

`src/components/site/ConversationThemes.tsx:60-68` (per the missed-opportunities audit) snaps its quote-examples panel open/closed instantly when a user taps a theme row — this is the literal "collapses/accordions that snap without a height+opacity transition" case named in this app's own AUDIT vocabulary, and per the performance audit, animating `height` directly here would itself be a new finding (layout-triggering property) — so this plan uses `clip-path`, not `height`, from the start.

```tsx
/* ConversationThemes.tsx:60-68 — current (paraphrased; verify exact JSX on open) */
{isOpen && theme.examples.length > 0 && (
  <div className="mt-2 flex flex-col gap-1.5">
    {theme.examples.map((ex) => <p key={ex.id}>{ex.text}</p>)}
  </div>
)}
```

## Target

Keep the panel always mounted (so it can animate its own exit, not just entrance — conditional rendering can only ever animate arrival, per this codebase's own established pattern seen elsewhere this session, e.g. `ArtistsBoard.tsx`'s trash-bin), driven by `clip-path` + `opacity`, within the dropdown/select budget:

```tsx
/* target */
{theme.examples.length > 0 && (
  <div
    className="mt-2 flex flex-col gap-1.5 overflow-hidden transition-[clip-path,opacity] duration-200 ease-out"
    style={{
      clipPath: isOpen ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)",
      opacity: isOpen ? 1 : 0,
    }}
  >
    {theme.examples.map((ex) => <p key={ex.id}>{ex.text}</p>)}
  </div>
)}
```

`ease-out` is used here (as the Tailwind keyword, or `var(--ease-out)` once plan 001 lands) since this is a genuine reveal/dismiss (entering/exiting), matching the loaded framework's decision order.

## Repo conventions to follow

- This codebase already established the "keep it mounted, drive visibility via CSS" pattern this session for exactly this reason (conditionally-rendered elements can't animate their own exit) — see `ArtistsBoard.tsx`'s permanently-mounted trash bin, which has an explicit code comment explaining this exact tradeoff. Follow that precedent rather than reintroducing conditional mounting here.
- `overflow-hidden` is required alongside `clip-path` so collapsed content doesn't affect the row's own layout/scrollability when hidden.

## Steps

1. Open `src/components/site/ConversationThemes.tsx` and locate the `isOpen && theme.examples.length > 0 &&` conditional block (around lines 60-68).
2. Change the condition to only gate on `theme.examples.length > 0` (always mount when there's content, regardless of open state), and drive visibility via the `clipPath`/`opacity` inline style keyed off `isOpen`, per Target.
3. Add `overflow-hidden` to the container's className if not already present.
4. Confirm clicking a different theme row (if only one panel can be open at a time) correctly closes the previously-open one via its own `isOpen` becoming false, not by unmounting.

## Boundaries

- Do NOT animate `height` or `max-height` directly — use `clip-path` per the Target, consistent with this plan's own stated reasoning and the app's broader performance findings (plan 006 and finding #14 in the main audit both flag `height`-based animation).
- Do NOT change how `isOpen` is computed/toggled — only how the panel visually responds to it.
- If the actual component structure conditionally renders each theme's whole row (not just the examples sub-panel) based on `isOpen`, STOP and report — this plan assumes only the quote-examples panel is conditional, not the row itself.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/components/site/ConversationThemes.tsx`, `npm run build` — all clean.
- **Feel check**: on the Social Listening tab's Conversation Themes chart, tap a theme row and confirm its quote examples now reveal via a clip/fade rather than snapping open; tap it again (or tap a different theme) and confirm the same panel smoothly hides rather than vanishing instantly. In DevTools' Animations panel at 10% playback, confirm no layout thrash (Performance panel should show no "Layout" entries during the toggle, only compositing).
- **Done when**: opening and closing any theme's quote panel is animated in both directions, the panel never affects sibling row positions with a hard snap, and no `height`/`max-height` property is animated anywhere in this file.
