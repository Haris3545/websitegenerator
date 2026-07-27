"use client";

import dynamicImport from "next/dynamic";

// Leaflet touches `window`/`document` at import time, so this can only ever
// run in the browser bundle. next/dynamic's ssr:false option is only
// allowed from within a Client Component (not directly in a Server
// Component page), which is why this thin loader exists as its own file —
// same shape as TourGlobe.tsx's own dynamic import of react-globe.gl.
export const LocationPinMapLoader = dynamicImport(
  () => import("@/components/site/LocationPinMap").then((m) => m.LocationPinMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[340px] items-center justify-center rounded-xl border border-white/10 text-xs text-white/30">
        Loading map...
      </div>
    ),
  }
);
