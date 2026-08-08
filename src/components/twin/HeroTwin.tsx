/**
 * Milestone 1 — the homepage Digital Twin.
 *
 * Client-only and lazily loaded: the renderer is fetched after hydration, so
 * the hero paints immediately and a visitor on a slow connection still sees a
 * real garage while it arrives. The placeholder holds exactly the same box, so
 * the swap costs no layout shift.
 */
import * as React from "react";

import { HeroGarageAnimation } from "@/components/spaceplanner/HeroGarageAnimation";

const TwinTeaser = React.lazy(() =>
  import("@/components/twin/HeroTwinTeaser").then((module) => ({
    default: module.HeroTwinTeaser,
  })),
);

export function HeroTwin() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const placeholder = <HeroGarageAnimation caption={null} />;
  if (!mounted) return placeholder;

  return (
    <React.Suspense fallback={placeholder}>
      <TwinTeaser />
    </React.Suspense>
  );
}
