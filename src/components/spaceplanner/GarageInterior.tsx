/**
 * A premium illustrated residential garage, drawn as an elevation view.
 *
 * Concrete floor, timber shelving, a workbench, storage cabinets and the
 * sectional door, lit by warm daylight. Pure SVG so it costs no network
 * requests, scales to any viewport and inherits the warm `scene-*` tokens in
 * both light and dark themes.
 */
import { cn } from "@/lib/utils";

export function GarageInterior({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/70 bg-card shadow-raised",
        className,
      )}
    >
      <svg
        viewBox="0 0 640 400"
        className="w-full"
        role="img"
        aria-label="Illustration of a bright residential garage with shelving, a workbench, boxes, a bicycle and a sectional door"
      >
        <defs>
          <linearGradient id="gi-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-scene-wall)" />
            <stop offset="100%" stopColor="var(--color-scene-floor)" />
          </linearGradient>
          <linearGradient id="gi-sun" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-scene-wall)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--color-scene-wall)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* shell */}
        <rect width="640" height="400" fill="url(#gi-wall)" />
        <rect y="300" width="640" height="100" className="fill-scene-floor" />
        <path d="M0 300h640" className="stroke-scene-floor-line" strokeWidth="2" fill="none" />
        {[110, 250, 400, 540].map((x) => (
          <path
            key={x}
            d={`M${x} 300 L${x - 40} 400`}
            className="stroke-scene-floor-line"
            strokeWidth="1.5"
            fill="none"
            opacity="0.6"
          />
        ))}

        {/* sectional door, part open, daylight beneath */}
        <rect x="368" y="40" width="248" height="150" rx="6" className="fill-scene-metal" />
        {[76, 112, 148].map((y) => (
          <path key={y} d={`M368 ${y}h248`} className="stroke-scene-line" strokeWidth="2" fill="none" />
        ))}
        <rect x="368" y="190" width="248" height="110" className="fill-scene-screen" opacity="0.5" />
        <rect x="368" y="186" width="248" height="10" rx="5" className="fill-scene-metal-dark" />

        {/* timber shelving with cardboard boxes */}
        <rect x="24" y="70" width="230" height="230" rx="6" className="fill-scene-wood" />
        {[70, 140, 210, 276].map((y) => (
          <rect key={y} x="24" y={y} width="230" height="10" rx="4" className="fill-scene-wood-dark" />
        ))}
        {[
          [36, 86],
          [96, 86],
          [156, 86],
          [36, 156],
          [110, 156],
          [180, 156],
          [36, 226],
          [120, 226],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width="56" height="52" rx="4" className="fill-scene-card" />
            <path
              d={`M${x} ${y + 26}h56`}
              className="stroke-scene-line"
              strokeWidth="1.5"
              fill="none"
            />
            <rect x={x + 18} y={y + 20} width="20" height="12" rx="3" className="fill-scene-card-dark" />
          </g>
        ))}

        {/* workbench + cabinets */}
        <rect x="272" y="212" width="86" height="12" rx="4" className="fill-scene-wood-dark" />
        <rect x="276" y="224" width="78" height="76" rx="5" className="fill-scene-wood" />
        <rect x="284" y="236" width="28" height="26" rx="3" className="fill-scene-wood-dark" opacity="0.4" />
        <rect x="320" y="236" width="28" height="26" rx="3" className="fill-scene-wood-dark" opacity="0.4" />
        <rect x="286" y="176" width="26" height="34" rx="4" className="fill-scene-metal" />
        <rect x="320" y="188" width="34" height="22" rx="4" className="fill-scene-fabric" />

        {/* bicycle against the wall */}
        <g transform="translate(392 214)">
          <circle cx="26" cy="60" r="26" className="fill-none stroke-scene-ink" strokeWidth="6" />
          <circle cx="108" cy="60" r="26" className="fill-none stroke-scene-ink" strokeWidth="6" />
          <path
            d="M26 60 L60 26 L92 26 L108 60 M60 26 L74 60 L108 60 M74 60 L26 60"
            className="fill-none stroke-scene-accent"
            strokeWidth="7"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path d="M52 18h22" className="fill-none stroke-scene-ink" strokeWidth="6" strokeLinecap="round" />
        </g>

        {/* suitcase + stacked boxes on the floor */}
        <rect x="530" y="228" width="66" height="72" rx="8" className="fill-scene-ink" />
        <rect x="548" y="214" width="30" height="12" rx="6" className="fill-scene-metal" />
        <rect x="536" y="248" width="54" height="8" rx="4" className="fill-scene-metal-dark" opacity="0.5" />

        {/* warm daylight wash */}
        <rect width="640" height="400" fill="url(#gi-sun)" opacity="0.55" />
      </svg>

      {/* ambience */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -inset-y-16 right-8 w-40 rotate-12 bg-[linear-gradient(90deg,transparent,var(--color-scene-wall),transparent)] opacity-40 motion-safe:animate-sp-daylight" />
        {[
          { left: "62%", top: "34%", delay: "0s" },
          { left: "74%", top: "58%", delay: "2s" },
          { left: "84%", top: "26%", delay: "3.4s" },
          { left: "56%", top: "70%", delay: "1.2s" },
        ].map((dust) => (
          <span
            key={dust.left + dust.top}
            className="absolute size-[3px] rounded-full bg-scene-ink/25 motion-safe:animate-sp-dust"
            style={{ left: dust.left, top: dust.top, animationDelay: dust.delay }}
          />
        ))}
      </div>
    </div>
  );
}
