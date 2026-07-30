# 012 — Fix SwipeCard JS timer / CSS transition duration mismatch

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 2 files (`src/hooks/useSwipeGesture.ts`, `src/components/site/ideas/SwipeCard.tsx`), ~10 lines

## Problem

`src/hooks/useSwipeGesture.ts` fires cleanup timers shorter than the CSS transition duration they're meant to wait for:

```js
/* useSwipeGesture.ts — current (per the interruptibility audit) */
window.setTimeout(() => setIsSettling(false), 300);      // spring-back path
window.setTimeout(() => { onCommit(direction); setOffset({x:0,y:0}); setIsSettling(false); }, 220); // fly-out path
```

```jsx
/* SwipeCard.tsx:191 — current */
transition: isDragging ? "none" : "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
```

On the fly-out (commit) path, the JS timer resets `offset` to `{x:0,y:0}` at 220ms, but the CSS transition animating the card's transform to its fly-out position takes 400ms. The reset happens 180ms before the transition visually finishes, so the outgoing card's transform snaps back toward center mid-flight — an interruption artifact, not a deliberate reversal.

## Target

Align the JS cleanup timing to the actual CSS duration instead of a separately-guessed number, and rely on the transition's own completion rather than a second hand-typed constant:

```js
/* target — useSwipeGesture.ts */
const SETTLE_TRANSITION_MS = 400; // must match SwipeCard.tsx's own transition duration

// spring-back path
window.setTimeout(() => setIsSettling(false), SETTLE_TRANSITION_MS);

// fly-out path — do NOT reset offset until the card is already unmounted
// by onCommit's own re-render (removing this card from the stack), so the
// snap-back never has a chance to render
window.setTimeout(() => {
  onCommit(direction);
  setIsSettling(false);
}, SETTLE_TRANSITION_MS);
```

Removing the `setOffset({x:0,y:0})` call from the fly-out path entirely is the key fix — once `onCommit` causes the parent to stop rendering this card (it's swiped away and replaced by the next one), there's no need to reset its transform at all; the component either unmounts or becomes irrelevant. If the same `SwipeCard` instance is reused for the next card (rather than a fresh mount), confirm that during Step 2 and only reset `offset` synchronously in that case, gated so it happens either before the next card's entrance animation starts or is invisible to the user (e.g. reset happens while `opacity: 0` or off-screen).

## Repo conventions to follow

- The transition duration `0.4s` in `SwipeCard.tsx:191` should become the single source of truth; `SETTLE_TRANSITION_MS` in the hook should be a literal comment-linked constant referencing it (this repo doesn't have a mechanism to share a literal duration between a `.ts` hook and a `.tsx` component's inline style automatically — a plain matching constant with an explanatory comment is the established pattern used elsewhere in this codebase, e.g. `usePoofEffect.tsx`'s `POOF_DURATION_MS`).

## Steps

1. Open `src/components/site/ideas/SwipeCard.tsx` and confirm the exact current transition duration at line 191 (`0.4s` per the audit — verify on open).
2. Open `src/hooks/useSwipeGesture.ts`. Add a `SETTLE_TRANSITION_MS` constant at the top of the file set to the same number (400), with a comment noting it must stay in sync with `SwipeCard.tsx`'s own `transition` duration.
3. Change the spring-back path's `window.setTimeout(() => setIsSettling(false), 300)` to use `SETTLE_TRANSITION_MS` instead of the hardcoded `300`.
4. Change the fly-out path's `window.setTimeout(() => { onCommit(direction); setOffset({x:0,y:0}); setIsSettling(false); }, 220)` to use `SETTLE_TRANSITION_MS` instead of `220`, and remove the `setOffset({x:0,y:0})` call per Target — confirm via reading `SwipeStack.tsx` (the parent) whether the same `SwipeCard`/hook instance persists across cards or a fresh one mounts per card; if fresh-mount-per-card, the removal is safe as-is; if the same instance persists, add the reset but gate it so it's not visible (see Target's caveat).

## Boundaries

- Do NOT change the CSS transition duration itself (`0.4s`) — only align the JS timers to match it.
- Do NOT change the spring-back path's actual behavior beyond the timing fix (300ms → 400ms) — it should still spring back to center, just wait the correct amount of time before clearing `isSettling`.
- Do NOT touch `AlbumCoverFlow.tsx` or any other swipe/drag system — this plan is scoped to the Ideas tab's swipe stack only.
- If `SwipeStack.tsx` reuses one `SwipeCard`/hook instance across multiple cards in a way not anticipated here, STOP and report the actual mount/reuse pattern rather than guessing how to gate the offset reset.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint src/hooks/useSwipeGesture.ts src/components/site/ideas/SwipeCard.tsx`, `npm run build` — all clean.
- **Feel check**: on the Ideas tab, swipe a card fully to commit (like/dislike) and watch in DevTools' Animations panel at 10% playback. Confirm the card's fly-out transform completes its full 400ms transition with no visible snap-back partway through. Also test a partial drag that doesn't cross the commit threshold (spring-back path) and confirm it settles back to center smoothly with no premature state-clear cutting the transition short.
- **Done when**: both the commit and spring-back paths wait the full CSS transition duration before their JS cleanup runs, and rapid successive swipes never show a card jumping/snapping mid-exit.
