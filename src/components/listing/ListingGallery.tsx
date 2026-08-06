/**
 * Listing hero gallery.
 *
 * Shows only photos the host actually uploaded — there are no placeholders and
 * nothing is fabricated. The lightbox is keyboard navigable (arrows, Escape),
 * swipeable on touch, and every image carries a real alt description.
 */
import * as React from "react";
import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface ListingGalleryProps {
  photoUrls: string[];
  title: string;
  /** Fired when the lightbox is opened, for analytics. */
  onOpen?: () => void;
}

export function ListingGallery({ photoUrls, title, onOpen }: ListingGalleryProps) {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const touchStart = React.useRef<number | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  const count = photoUrls.length;
  const alt = (i: number) => `${title || "Storage space"} — photo ${i + 1} of ${count}`;

  const show = React.useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  const openAt = (i: number) => {
    setIndex(i);
    setOpen(true);
    onOpen?.();
  };

  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowRight") show(index + 1);
      if (event.key === "ArrowLeft") show(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, show]);

  if (count === 0) {
    return (
      <div className="grid aspect-16/10 w-full place-items-center rounded-2xl border border-border bg-muted text-muted-foreground">
        <span className="flex items-center gap-2 type-body-sm">
          <ImageOff className="size-4" aria-hidden="true" /> No photos added yet
        </span>
      </div>
    );
  }

  const rest = photoUrls.slice(1, 5);

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <button
          type="button"
          onClick={() => openAt(0)}
          className="group relative block aspect-16/10 w-full overflow-hidden rounded-2xl bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Open photo gallery — ${count} photo${count === 1 ? "" : "s"}`}
        >
          <img
            src={photoUrls[0]}
            alt={alt(0)}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            fetchPriority="high"
          />
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 type-badge text-foreground shadow-card">
            <Expand className="size-3.5" aria-hidden="true" />
            {count} photo{count === 1 ? "" : "s"}
          </span>
        </button>

        {rest.length ? (
          <ul className="hidden grid-cols-2 gap-2 sm:grid">
            {rest.map((url, i) => (
              <li key={url} className="min-w-0">
                <button
                  type="button"
                  onClick={() => openAt(i + 1)}
                  className="block size-full overflow-hidden rounded-xl bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={`Open photo ${i + 2}`}
                >
                  <img
                    src={url}
                    alt={alt(i + 1)}
                    loading="lazy"
                    className="aspect-4/3 size-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {count > 1 ? (
        <ul className="carousel-track mt-2 gap-2 sm:hidden" aria-label="More photos">
          {photoUrls.slice(1).map((url, i) => (
            <li key={url} className="carousel-item w-32 shrink-0">
              <button
                type="button"
                onClick={() => openAt(i + 1)}
                className="block overflow-hidden rounded-xl bg-muted"
                aria-label={`Open photo ${i + 2}`}
              >
                <img
                  src={url}
                  alt={alt(i + 1)}
                  loading="lazy"
                  className="aspect-4/3 w-32 object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title || "Storage space"} photos`}
          className="fixed inset-0 z-50 flex flex-col bg-foreground/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onTouchStart={(e) => {
            touchStart.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            const end = e.changedTouches[0]?.clientX ?? null;
            if (start === null || end === null) return;
            if (Math.abs(end - start) > 48) show(end < start ? index + 1 : index - 1);
            touchStart.current = null;
          }}
        >
          <div className="flex items-center justify-between gap-3 text-background">
            <p className="type-body-sm tabular-nums">
              {index + 1} / {count}
            </p>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close photo gallery"
              className="grid size-11 place-items-center rounded-full bg-background/15 hover:bg-background/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 items-center gap-2">
            {count > 1 ? <GalleryArrow direction="prev" onClick={() => show(index - 1)} /> : null}
            <img
              src={photoUrls[index]}
              alt={alt(index)}
              className="mx-auto max-h-full min-h-0 w-auto max-w-full rounded-xl object-contain transition-opacity duration-200"
            />
            {count > 1 ? <GalleryArrow direction="next" onClick={() => show(index + 1)} /> : null}
          </div>

          {count > 1 ? (
            <ul className="carousel-track mt-3 gap-2" aria-label="Choose a photo">
              {photoUrls.map((url, i) => (
                <li key={url} className="carousel-item shrink-0">
                  <button
                    type="button"
                    onClick={() => show(i)}
                    aria-label={`Show photo ${i + 1}`}
                    aria-current={i === index}
                    className={cn(
                      "block overflow-hidden rounded-lg border-2",
                      i === index ? "border-primary" : "border-transparent opacity-70",
                    )}
                  >
                    <img src={url} alt="" loading="lazy" className="h-14 w-20 object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function GalleryArrow({ direction, onClick }: { direction: "prev" | "next"; onClick: () => void }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous photo" : "Next photo"}
      className="grid size-11 shrink-0 place-items-center rounded-full bg-background/15 text-background hover:bg-background/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Icon className="size-6" aria-hidden="true" />
    </button>
  );
}
