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
        <div className="font-[inherit]">
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)] sm:text-base">
            {tagline}
          </p>
          <h1
            className="mt-1 text-2xl text-white sm:text-3xl"
            style={{
              fontWeight: "var(--header-font-weight, 700)",
              fontStyle: "var(--header-font-style, normal)",
            }}
          >
            {projectTitle}
          </h1>
        </div>
        <p className="text-2xl font-semibold text-white/80 sm:text-3xl">{artistName}</p>
      </div>
      <div className="mt-4 h-1 w-full bg-[var(--accent)]" />
    </div>
  );
}
