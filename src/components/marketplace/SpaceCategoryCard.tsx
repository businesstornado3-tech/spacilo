import { cn } from "@/lib/utils";

interface SpaceCategoryCardProps {
  label: string;
  /** e.g. "24 nearby" */
  meta?: string;
  photoUrl?: string;
  photoAlt: string;
  onSelect?: () => void;
  className?: string;
}

/**
 * Photo-led category tile — garages, spare rooms, lofts, sheds.
 * Designed to sit in a mobile carousel or a two-up grid.
 */
export function SpaceCategoryCard({
  label,
  meta,
  photoUrl,
  photoAlt,
  onSelect,
  className,
}: SpaceCategoryCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative block w-full overflow-hidden rounded-2xl text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <div className="aspect-[4/5] w-full bg-muted">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAlt}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : null}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-foreground/75 to-transparent p-4 pt-10">
        <p className="type-card-title text-background">{label}</p>
        {meta ? <p className="type-body-sm text-background/80">{meta}</p> : null}
      </div>
    </button>
  );
}
