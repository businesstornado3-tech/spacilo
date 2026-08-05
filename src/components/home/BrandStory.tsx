/**
 * The emotional marketplace story (1E). No sustainability or environmental
 * claims — just the observation that unused space already exists nearby.
 */
import { Reveal } from "@/components/common/Reveal";

const examples = [
  "A half-empty garage down the road.",
  "A spare room around the corner.",
  "A loft nobody uses.",
];

export function BrandStory() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <Reveal className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <h2 className="max-w-[16ch] type-h2">
            Space is everywhere.
            <br />
            It just isn't being shared.
          </h2>
          <p className="mt-4 max-w-md type-body text-muted-foreground">
            Spacilo connects people who need more room with people who already have it.
          </p>
        </div>
        <ul className="grid gap-3">
          {examples.map((line) => (
            <li
              key={line}
              className="rounded-2xl border border-border bg-card p-5 type-body text-muted-foreground"
            >
              {line}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
