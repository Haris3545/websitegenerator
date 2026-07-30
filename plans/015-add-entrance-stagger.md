# 015 — Add entrance stagger to 8 list/grid bulk-mount surfaces

- **Status**: TODO
- **Commit**: 46a1b7b
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 8 files, ~5 lines each

## Problem

Confirmed by the cohesion audit: only two files in the repo use any `animationDelay`/index-based stagger, and neither is a list-entrance stagger (one desyncs an infinite jiggle loop, the other spaces a single click's particle burst). Every genuine "mount N items at once" render has zero entrance stagger, several with zero entrance transition at all:

```tsx
/* src/components/site/MediaList.tsx:17 — current */
{visible.map((article) => <ArticleCard key={article.id} article={article} />)}

/* src/components/builder/ArtistsBoard.tsx:515 (also :492 for folders) — current */
{artists.map((artist) => <ArtistTile key={artist.id} artist={artist} />)}

/* src/components/site/CampaignGanttBoard.tsx:522 — current */
{blocksByPillar[p.value].map((b) => <Block key={b.id} block={b} />)}
```

(plus `BoardList.tsx:117`, `tactics/TacticsBoard.tsx:99`, `MonthCalendar.tsx:496`, `DashboardOverview.tsx:114`, `ProvisioningOverlay.tsx:251` — full list per the audit.)

## Target

A small shared CSS utility plus a per-item inline `animationDelay`, capped at the loaded framework's 30–80ms range and never blocking interaction:

```css
/* target — add to src/app/globals.css, near tab-in */
@keyframes list-item-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-list-item-in {
  animation: list-item-in 0.2s var(--ease-out) both;
}
```

```tsx
/* target — applied per item, e.g. MediaList.tsx */
{visible.map((article, i) => (
  <ArticleCard
    key={article.id}
    article={article}
    className="animate-list-item-in"
    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
  />
))}
```

The `Math.min(i, 8)` cap prevents a very long list (50 articles) from producing a multi-second cascading delay — after the 9th item, all remaining items animate simultaneously at the same 320ms delay, which is imperceptible that far down a scrolled list anyway.

## Repo conventions to follow

- `--ease-out` token from plan 001 must exist first.
- `usePoofEffect.tsx:28`'s existing `animationDelay: ${i * 0.01}s` per-particle stagger is the closest existing precedent in this codebase for inline per-item `animationDelay` — match its inline-style approach (not a CSS `nth-child` selector, which doesn't work well with dynamic list lengths) rather than inventing a different mechanism.
- Several of the 8 target components (`ArticleCard`, `Block`, board-item cards) may not currently accept a `className`/`style` prop pass-through — check each component's prop signature before assuming it can receive the new stagger className/style directly on itself vs. needing a wrapping `<div>`.

## Steps

1. Add the `list-item-in` keyframe and `.animate-list-item-in` class to `src/app/globals.css` per Target.
2. For each of the 8 sites (`MediaList.tsx:17`, `ArtistsBoard.tsx:492,515`, `CampaignGanttBoard.tsx:522`, `BoardList.tsx:117`, `tactics/TacticsBoard.tsx:99`, `MonthCalendar.tsx:496`, `DashboardOverview.tsx:114`, `ProvisioningOverlay.tsx:251`), add the `.animate-list-item-in` class and inline `animationDelay` style to each mapped item, using the array index from `.map((item, i) => ...)` — add the index parameter to the map callback if it isn't already destructured.
3. For components that don't accept `className`/`style` props directly, wrap the mapped output in a `<div className="animate-list-item-in" style={{ animationDelay: ... }}>` around the existing component instead of modifying the component itself.
4. For `ProvisioningOverlay.tsx:251` specifically (the first-run checklist), keep the stagger short (its list is fixed at ~11 items, well under the 8-item cap threshold, so no capping needed there) — this is the app's one true first-run delight moment per the missed-opportunities findings, so a slightly more generous stagger (e.g. 50ms instead of 40ms) is acceptable here per the framework's allowance for rare/first-time moments, but stay within the 30-80ms range.

## Boundaries

- Do NOT add stagger to any list that re-renders on every keystroke/frequent interaction (e.g. do not add this to anything filtering as the user types) — only genuine one-time-per-view mounts.
- Do NOT make the stagger blocking — items must remain independently clickable/interactive immediately, never gated behind the animation completing (this is explicitly non-negotiable per the loaded framework: "Stagger is decorative — it must never block interaction").
- Do NOT change any list's actual data/sort order — only the entrance visual.
- If any of the 8 files' cited line numbers have drifted since commit 46a1b7b, STOP and report rather than guessing where the `.map(` call moved to.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint <all 8 files>`, `npm run build` — all clean.
- **Feel check**: load the Media tab and confirm articles cascade in with a visible but fast stagger (not "wait for the list to finish appearing" — the whole cascade should complete well under a second for a typical 10-item page). Immediately try clicking the first article before the stagger finishes on later items — confirm it's clickable instantly, proving the stagger doesn't block interaction. Repeat for the Provisioning Overlay's checklist on a fresh artist creation.
- **Done when**: all 8 surfaces show a 30-80ms-per-item cascade on mount, capped so long lists don't produce excessive total delay, and no list item is ever unclickable while its stagger is still playing.
