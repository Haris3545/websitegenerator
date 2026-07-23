export function PlaceholderSection({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-8">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-white/50">{note}</p>
    </div>
  );
}
