"use client";

import { ErrorRetry } from "@/components/ErrorRetry";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetry error={error} reset={reset} storageKey="err-site" dark />;
}
