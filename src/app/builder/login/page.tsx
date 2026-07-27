"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const navigatedRef = useRef(false);
  // Flips true once the client has actually confirmed a readable session
  // (not just that signInWithPassword resolved) — see the polling loop in
  // handleSubmit below.
  const sessionReadyRef = useRef(false);

  function proceedToArtists() {
    if (navigatedRef.current) return;
    if (!sessionReadyRef.current) {
      // Still confirming the session client-side — try again shortly
      // rather than racing a hard navigation against it.
      window.setTimeout(proceedToArtists, 150);
      return;
    }
    navigatedRef.current = true;
    // A hard navigation rather than router.push — the artists list is a
    // Server Component reading the session from cookies. Waiting on
    // sessionReadyRef above means this only fires once the client itself
    // can read back a session, so the server request that follows reads
    // whatever cookies are actually on disk by then.
    window.location.href = searchParams.get("next") ?? "/builder";
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

    // Confirms the session is actually retrievable client-side before
    // proceedToArtists is allowed to navigate — signInWithPassword
    // resolving doesn't guarantee the auth cookies have finished being
    // written yet, and that race was still occasionally landing on the
    // artists list with no session visible server-side (RLS then quietly
    // returns zero rows, looking like "no artist sites" until a manual
    // reload). Gives up and proceeds anyway after ~3s so a genuine failure
    // here can never strand a signed-in admin on a frozen screen.
    for (let i = 0; i < 20; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) break;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    sessionReadyRef.current = true;
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
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <BrandLogoAnimation className="h-9 w-9 dark:invert" />
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-white/80">
              Cultural Intelligence Designer
            </p>
          </div>
          <p className="mt-3 text-xs text-neutral-400 dark:text-white/30">
            Internal admin access for the dashboard generator.
          </p>
        </div>
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
