import { Link } from "@tanstack/react-router";

import renterPhoto from "@/assets/sample-spare-room.jpg";
import hostPhoto from "@/assets/sample-shed.jpg";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";

const sides = [
  {
    title: "Need space?",
    body: "Find somewhere nearby for the things you don't have room for.",
    cta: "Find storage",
    to: "/find-storage" as const,
    photo: renterPhoto,
    alt: "Spare room in a UK home with space set aside for a renter's boxes",
  },
  {
    title: "Have space?",
    body: "Turn unused space into additional monthly income.",
    cta: "Become a host",
    to: "/list-space" as const,
    photo: hostPhoto,
    alt: "Timber garden shed in a British back garden with room for storage",
  },
];

export function TwoSidedCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <ul className="grid gap-4 md:grid-cols-2">
        {sides.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i * 80}>
            <article className="group h-full overflow-hidden rounded-3xl bg-card shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-raised">
              <img
                src={s.photo}
                alt={s.alt}
                loading="lazy"
                className="aspect-[16/10] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <div className="p-6">
                <h3 className="type-h3">{s.title}</h3>
                <p className="mt-2 type-body-sm text-muted-foreground">{s.body}</p>
                <Button asChild size="lg" className="mt-5">
                  <Link to={s.to}>{s.cta}</Link>
                </Button>
              </div>
            </article>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
