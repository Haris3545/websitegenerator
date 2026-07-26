import Link from "next/link";
import { signOut } from "@/app/builder/actions";
import { ThemeToggle } from "@/components/builder/ThemeToggle";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-white">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-neutral-200 bg-white/80 px-6 py-3 backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/80">
        <Link href="/builder/artists" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vccp-media-logo.png" alt="" className="h-8 w-8 shrink-0 dark:invert" />
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">VCCP Media</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-white/40">
              Cultural Intelligence Designer
            </p>
          </div>
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-white/50 dark:hover:text-white"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      <ThemeToggle />
    </div>
  );
}
