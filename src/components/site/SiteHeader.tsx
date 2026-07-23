export function SiteHeader({
  projectTitle,
  tagline,
  artistName,
}: {
  projectTitle: string;
  tagline: string;
  artistName: string;
}) {
  return (
    <div className="px-6 pt-6 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
            {tagline}
          </p>
          <h1 className="text-4xl font-bold text-white sm:text-5xl">{projectTitle}</h1>
        </div>
        <p className="text-lg font-semibold text-white/80 sm:text-xl">{artistName}</p>
      </div>
      <div className="mt-4 h-1 w-full bg-[var(--accent)]" />
    </div>
  );
}
