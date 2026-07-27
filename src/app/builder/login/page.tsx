"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signInAction } from "@/app/builder/actions";
import { ThemeToggle } from "@/components/builder/ThemeToggle";
import { BrandLogoAnimation } from "@/components/BrandLogoAnimation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7c1.9 0 3.5.5 4.8 1.2M22 12s-1.2 2.4-3.5 4.3M9.9 9.9a2.75 2.75 0 0 0 3.9 3.9"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4.5 4.5 19.5 19.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const navigatedRef = useRef(false);

  function proceedToArtists() {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // A hard navigation — sign-in itself now happens in signInAction (a
    // Server Action), which sets the session cookie in the same
    // request/response cycle, so by the time this runs the cookie is
    // already on disk. No client-side race left to wait out.
    window.location.href = searchParams.get("next") ?? "/builder";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signInAction(email, password, rememberMe);
    if (!result.ok) {
      setError(result.error);
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
        <div className="mb-10 mt-6 flex flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <BrandLogoAnimation className="h-9 w-9 dark:invert" />
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-white/80">
              Cultural Intelligence Designer
            </p>
          </div>
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
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 pr-10 focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-700 dark:text-white/40 dark:hover:text-white/80"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-white/60">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 accent-builder-accent dark:border-white/20"
            />
            Remember me
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
