export function SiteHeader({ name, tagline }: { name: string; tagline: string }) {
  return (
    <div className="px-6 pt-6 sm:px-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
        {tagline}
      </p>
      <h1 className="text-4xl font-bold text-white sm:text-5xl">{name}</h1>
      <div className="mt-4 h-1 w-full bg-[var(--accent)]" />
    </div>
  );
}
