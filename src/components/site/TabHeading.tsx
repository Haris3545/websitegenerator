import { resolveContent } from "@/lib/contentOverrides";
import { Editable } from "@/components/site/Editable";

/** The accent-bar + title + subtitle header repeated at the top of every
 * tab — factored out so title text ("Dashboard", "Music", ...) gets the
 * same permanent, click-to-edit coverage the subtitle next to it already
 * had, without copy-pasting the same three-element block into each page. */
export function TabHeading({
  artistId,
  contentOverrides,
  tabKey,
  title,
  subtitle,
}: {
  artistId: string;
  contentOverrides: Record<string, string> | null | undefined;
  tabKey: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <div className="h-4 w-1 bg-[var(--accent)]" />
      <Editable
        artistId={artistId}
        contentKey={`${tabKey}.title`}
        value={resolveContent(contentOverrides, `${tabKey}.title`, title)}
        as="h2"
        className="whitespace-nowrap text-lg font-bold uppercase"
      />
      <Editable
        artistId={artistId}
        contentKey={`${tabKey}.subtitle`}
        value={resolveContent(contentOverrides, `${tabKey}.subtitle`, subtitle)}
        as="span"
        className="text-sm text-white/40"
      />
    </div>
  );
}
