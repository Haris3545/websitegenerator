export function SiteHeader({
  projectTitle,
  tagline,
}: {
  projectTitle: string;
  tagline: string;
}) {
  return (
    <div className="px-6 pt-6 sm:px-10">
      <div className="font-[inherit]">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)] sm:text-xs">
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
      <div className="mt-4 h-1 w-full bg-[var(--accent)]" />
    </div>
  );
}
