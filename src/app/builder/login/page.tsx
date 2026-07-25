"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/builder/ThemeToggle";

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

    router.push(searchParams.get("next") ?? "/builder");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen justify-center bg-white text-neutral-900 dark:bg-neutral-950 dark:text-white">
      <div className="flex w-full max-w-sm flex-col justify-center px-4">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-violet-500" />
          <h1 className="text-2xl font-semibold tracking-tight">Builder login</h1>
        </div>
        <p className="mb-6 text-sm text-neutral-500 dark:text-white/50">
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
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-violet-400 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
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
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-violet-400 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
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
            className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
      <ThemeToggle />
    </div>
  );
}
