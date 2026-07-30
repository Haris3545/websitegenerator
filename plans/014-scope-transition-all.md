# 014 — Scope `transition-all` down to the properties actually animated

- **Status**: DONE
- **Commit**: 46a1b7b
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 24 files, 1 line each

## Problem

35 occurrences of Tailwind's `transition-all` across 24 files, confirmed by the performance audit's grep sweep. Per the loaded framework, `transition: all` (and Tailwind's `transition-all`) is always a finding — it animates unintended properties off the compositor fast-path even when the element only ever changes `transform`/`opacity`/color. Representative sites (full list to be gathered via the grep in Steps):

```tsx
/* src/components/site/KpiCard.tsx:27 — current */
className="... transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_28px_var(--accent)]"

/* src/components/site/DiscussionBoard.tsx:465 — current */
className={`rounded-xl border ... p-3.5 transition-all duration-200 ${
  deletingIds.has(post.id) ? "scale-95 opacity-0" : "scale-100 opacity-100"
} ...`}
```

## Target

Replace each `transition-all` with the narrowest Tailwind transition utility (or explicit `transition-[property1,property2]`) covering exactly what that element animates:

```tsx
/* target — KpiCard.tsx (animates transform, filter/brightness, box-shadow) */
className="... transition-[transform,filter,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_28px_var(--accent)]"

/* target — DiscussionBoard.tsx:465 (animates only transform + opacity via scale-*/opacity-* classes) */
className={`rounded-xl border ... p-3.5 transition-[transform,opacity] duration-200 ${
  deletingIds.has(post.id) ? "scale-95 opacity-0" : "scale-100 opacity-100"
} ...`}
```

## Repo conventions to follow

- This repo already uses scoped Tailwind transition utilities correctly in the majority of cases (`transition-colors`, `transition-opacity`, `transition-transform` appear 154 times per the performance audit) — `transition-all` is the exception, not the norm; match the surrounding codebase's existing preference.
- Where an element only animates one category (e.g. only color, only transform), use the plain Tailwind utility (`transition-colors`, `transition-transform`) rather than the bracket syntax — reserve `transition-[...]` for genuine multi-property cases like `KpiCard.tsx` above.

## Steps

1. Run `grep -rn "transition-all" src` to get the authoritative, current list of every occurrence (expect ~35 across ~24 files; the exact set may have shifted slightly since the audit).
2. For each occurrence, read the surrounding className to determine exactly which CSS properties actually change on that element (check for `hover:`/`active:`/conditional classes that swap `scale-*`, `opacity-*`, `translate-*`, `bg-*`, `text-*`, `border-*`, `shadow-*`, `brightness-*`, etc. in the same className string).
3. Replace `transition-all` with the matching scoped utility or bracket list per Target's pattern — do not guess; only include properties you can see actually change somewhere in that element's className.
4. Work through files in this priority order (highest-traffic first, per the purpose/frequency audit): `KpiCard.tsx`, `ArticleCard.tsx`, `InsightCard.tsx`, `BoardList.tsx` (x2 occurrences), `tactics/TacticCard.tsx`, `EventList.tsx`, `SiteFooter.tsx` (x5), `LocationPinMap.tsx` (x3), `NavPills.tsx`, `MonthCalendar.tsx`, `WikipediaTrends.tsx`, `AudienceTable.tsx`, `PendingIdeaStack.tsx`, `tactics/TacticsBoard.tsx`, `ideas/IdeasBoard.tsx`, `ideas/SwipeStack.tsx` (x2), `DiscussionBoard.tsx` (x2), `AestheticPanel.tsx`, `ConversationThemes.tsx`, `ProvisioningOverlay.tsx`, `ArtistForm.tsx` (x2), `ArtistsBoard.tsx`, `src/app/s/[slug]/(app)/music/page.tsx`, `src/app/s/[slug]/(app)/youtube/page.tsx`.

## Boundaries

- Do NOT change any hover/active/conditional visual value — only the `transition-all` → scoped-property change.
- Do NOT touch the width-animated progress bars in `ProvisioningOverlay.tsx`, `ConversationThemes.tsx`, or `ArtistForm.tsx` beyond scoping their `transition-all` to `transition-[width]` (or, if plan 006's sibling perf work on progress bars has already landed by the time this plan executes, `transition-transform` instead — check whether those three sites still animate `width` directly before choosing which property name to scope to).
- If a site's className has drifted enough that you can't confidently determine which properties change, leave that specific occurrence as `transition-all` and note it in your final report rather than guessing.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npx eslint <all touched files>`, `npm run build` — all clean.
- **Feel check**: spot-check 5 of the 24 touched files by triggering their hover/active/conditional states and confirming the transition still looks identical to before — this plan should be invisible in normal use, only measurable via DevTools' Performance panel showing fewer recalculated properties per transition.
- **Done when**: `grep -rn "transition-all" src` returns zero results (or only the explicitly-noted drift exceptions from Boundaries), and no visual regression exists on any touched element.
