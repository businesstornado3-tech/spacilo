import { BadgeCheck, Boxes, Lock, MapPinOff } from "lucide-react";

const items = [
  { icon: BadgeCheck, label: "Verified users" },
  { icon: Boxes, label: "Declared belongings" },
  { icon: MapPinOff, label: "Private addresses" },
  { icon: Lock, label: "Secure payments" },
];

export function TrustStrip() {
  return (
    <section aria-label="How Project Stow keeps things transparent" className="border-y border-border bg-surface">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 sm:px-6 md:grid-cols-4 md:py-5">
        {items.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2 type-body-sm text-muted-foreground">
            <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
