import type { ReactNode } from "react";
import { BrandLogoAnimation } from "@/components/BrandLogoAnimation";

/** A small branded flourish for "nothing here yet" states, in place of
 * plain placeholder text. `variant="site"` matches the always-dark artist
 * dashboards (bear mark forced white via `invert`); `variant="builder"`
 * matches the builder's own light/dark toggle (`dark:invert` instead, so
 * it tracks whichever theme is active). */
export function BrandedEmptyState({
  message,
  variant = "site",
}: {
  message: ReactNode;
  variant?: "site" | "builder";
}) {
  if (variant === "builder") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-white/10 dark:text-white/40">
        <BrandLogoAnimation className="h-10 w-10 opacity-50 dark:invert" />
        <p>{message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
      <BrandLogoAnimation className="h-10 w-10 opacity-60 invert" />
      <p>{message}</p>
    </div>
  );
}
