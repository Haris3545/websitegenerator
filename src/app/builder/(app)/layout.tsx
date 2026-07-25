import Link from "next/link";
import { signOut } from "@/app/builder/actions";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-neutral-950/80 px-6 py-3 backdrop-blur-md">
        <Link href="/builder/artists" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="h-2 w-2 rounded-full bg-violet-500" />
          Dashboard Builder
        </Link>
        <form action={signOut}>
          <button type="submit" className="text-sm text-white/50 hover:text-white">
            Sign out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
