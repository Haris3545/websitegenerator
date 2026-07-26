"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/builder/ThemeToggle";
import { BrandLogoAnimation } from "@/components/BrandLogoAnimation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const navigatedRef = useRef(false);

  function proceedToArtists() {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push(searchParams.get("next") ?? "/builder");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // A quick branded beat before landing on the artists list, rather than
    // navigating the instant auth succeeds. onEnded drives the actual
    // navigation; the timeout is just a safety net in case autoplay is
    // blocked or the video fails to load, so a signed-in admin is never
    // stuck looking at a frozen login form.
    setTransitioning(true);
    window.setTimeout(proceedToArtists, 2500);
  }

  if (transitioning) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950">
        <BrandLogoAnimation className="h-20 w-20 dark:invert" onEnded={proceedToArtists} />
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-white/30">
          Signing you in…
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen justify-center bg-white text-neutral-900 dark:bg-neutral-950 dark:text-white">
      <div className="flex w-full max-w-sm flex-col justify-center px-4">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vccp-media-logo.png" alt="" className="h-16 w-16 dark:invert" />
          <p className="mt-3 text-lg font-semibold tracking-tight">VCCP Media</p>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-white/40">
            Cultural Intelligence Designer
          </p>
        </div>
        <h1 className="mb-1 text-center text-sm font-medium text-neutral-500 dark:text-white/50">Builder login</h1>
        <p className="mb-6 text-center text-xs text-neutral-400 dark:text-white/30">
          Internal admin access for the dashboard generator.
        </p>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-6 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
              Password
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-builder-accent px-3 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:brightness-95 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
      <ThemeToggle />
    </div>
  );
}
