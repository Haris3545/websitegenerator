"use client";

import { ErrorRetry } from "@/components/ErrorRetry";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetry error={error} reset={reset} storageKey="err-root" dark />;
}
