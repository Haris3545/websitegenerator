"use client";

import { useState } from "react";
import { MonthCalendar } from "@/components/site/MonthCalendar";
import { PendingIdeaStack } from "@/components/site/PendingIdeaStack";
import type { ArtistEvent, BoardItem } from "@/lib/database.types";

/** Wires the month grid and the "to be confirmed" idea stack together so a
 * card can be dragged from one into the other: PendingIdeaStack reports
 * which day cell is currently under the pointer (for MonthCalendar to
 * highlight) and, on a successful drop, the event it just scheduled (for
 * MonthCalendar to render immediately, without a full page refetch). */
export function CalendarBoard({
  artistId,
  slug,
  initialEvents,
  initialTbcIdeas,
}: {
  artistId: string;
  slug: string;
  initialEvents: ArtistEvent[];
  initialTbcIdeas: BoardItem[];
}) {
  const [dragHoverDayKey, setDragHoverDayKey] = useState<string | null>(null);
  const [injectedEvent, setInjectedEvent] = useState<ArtistEvent | null>(null);

  return (
    <>
      <div className="mt-4">
        <MonthCalendar
          artistId={artistId}
          slug={slug}
          events={initialEvents}
          dragHoverDayKey={dragHoverDayKey}
          injectedEvent={injectedEvent}
          onInjected={() => setInjectedEvent(null)}
        />
      </div>

      {initialTbcIdeas.length > 0 && (
        <div className="mt-8">
          <PendingIdeaStack
            artistId={artistId}
            slug={slug}
            items={initialTbcIdeas}
            onHoverDayChange={setDragHoverDayKey}
            onScheduled={setInjectedEvent}
          />
        </div>
      )}
    </>
  );
}
