"use client";

import { usePathname } from "next/navigation";

/** Re-triggers a fade/slide-in animation (see globals.css) whenever the tab
 * route changes, by remounting the keyed div on pathname change. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-tab-in">
      {children}
    </div>
  );
}
