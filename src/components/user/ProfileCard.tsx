import { cn } from "@/lib/utils";
import { Rating } from "@/components/marketplace/Rating";
import { VerificationBadge, type VerificationBadgeType } from "@/components/trust/VerificationBadge";

export interface ProfileCardProps {
  name: string;
  /** "Host" and "Renter" cards are the same component with a different role label */
  role: "host" | "renter";
  areaName?: string;
  memberSince?: string;
  bio?: string;
  avatarUrl?: string;
  rating?: number;
  reviewCount?: number;
  verifications?: VerificationBadgeType[];
  stats?: { label: string; value: string }[];
  actions?: React.ReactNode;
  className?: string;
}

export function ProfileCard({
  name,
  role,
  areaName,
  memberSince,
  bio,
  avatarUrl,
  rating,
  reviewCount,
  verifications = [],
  stats = [],
  actions,
  className,
}: ProfileCardProps) {
  const roleLabel = role === "host" ? "Host" : "Renter";

  return (
    <article className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}>
      <div className="flex items-start gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${name}, ${roleLabel}`}
            className="size-14 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-lg font-semibold text-primary-soft-foreground"
          >
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="type-overline text-muted-foreground">{roleLabel}</p>
          <h3 className="mt-0.5 type-h3 truncate">{name}</h3>
          <p className="type-body-sm text-muted-foreground">
            {[areaName, memberSince ? `Member since ${memberSince}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {rating !== undefined ? (
            <Rating value={rating} reviewCount={reviewCount} size="sm" className="mt-2" />
          ) : null}
        </div>
      </div>

      {bio ? <p className="mt-4 type-body-sm text-muted-foreground">{bio}</p> : null}

      {verifications.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {verifications.map((v) => (
            <li key={v}>
              <VerificationBadge type={v} />
            </li>
          ))}
        </ul>
      ) : null}

      {stats.length > 0 ? (
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="type-body-sm text-muted-foreground">{s.label}</dt>
              <dd className="type-label mt-0.5">{s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}
