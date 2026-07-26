"use client";

import { useTransition } from "react";
import { updateDashboardSectionOrder } from "@/app/s/[slug]/actions";
import { ReorderableSections, type SectionEntry } from "@/components/site/ReorderableSections";

export type DashboardSectionEntry = SectionEntry;

export function DashboardSections({ artistId, sections }: { artistId: string; sections: SectionEntry[] }) {
  const [, startTransition] = useTransition();

  return (
    <ReorderableSections
      sections={sections}
      onReorder={(order) => startTransition(() => updateDashboardSectionOrder(artistId, order))}
    />
  );
}
