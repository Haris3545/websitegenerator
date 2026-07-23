import Link from "next/link";
import { signOut } from "@/app/builder/actions";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <Link href="/builder/artists" className="font-semibold">
          Dashboard Builder
        </Link>
        <form action={signOut}>
          <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
            Sign out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
