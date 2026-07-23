export function PlaceholderSection({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-black/30 p-8 shadow-lg shadow-black/30 backdrop-blur-md">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-white/50">{note}</p>
    </div>
  );
}
