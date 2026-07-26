"use client";

import { useTransition } from "react";
import { updateYoutubeSectionOrder } from "@/app/s/[slug]/actions";
import { ReorderableSections, type SectionEntry } from "@/components/site/ReorderableSections";

export function YoutubeSections({ artistId, sections }: { artistId: string; sections: SectionEntry[] }) {
  const [, startTransition] = useTransition();

  return (
    <ReorderableSections
      sections={sections}
      onReorder={(order) => startTransition(() => updateYoutubeSectionOrder(artistId, order))}
    />
  );
}
