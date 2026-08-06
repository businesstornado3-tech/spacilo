import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Home, ArrowRight } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = "Get started — " + brand.name;
const description =
  "Join " + brand.name + " as someone who needs storage, or as a host with space to spare.";

export const Route = createFileRoute("/get-started")({
  head: () => ({
    ...publicRouteMeta({ title: title, description: description, path: "/get-started" }),
    scripts: [
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: title, path: "/get-started" },
        ]),
      ),
    ],
  }),
  component: GetStartedPage,
});

const choices = [
  {
    mode: "renter" as const,
    icon: Boxes,
    title: "I need storage",
    body: "Find trusted space nearby for the things you don't have room for.",
    cta: "Find my space",
  },
  {
    mode: "host" as const,
    icon: Home,
    title: "I have space",
    body: "Turn unused space into additional monthly income.",
    cta: "Start hosting",
  },
];

function GetStartedPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="type-h1">What brings you here?</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">
          Pick where you'd like to start. It only sets your first view.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {choices.map((choice) => (
            <li key={choice.mode}>
              <Link
                to="/signup"
                search={{ mode: choice.mode }}
                className="group flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-soft-foreground">
                  <choice.icon className="size-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 type-h3">{choice.title}</h2>
                <p className="mt-2 flex-1 type-body-sm text-muted-foreground">{choice.body}</p>
                <span className="mt-6 inline-flex items-center gap-2 type-nav text-primary">
                  {choice.cta}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 type-body-sm text-muted-foreground">
          You can do both and switch anytime.
        </p>

        <p className="mt-8 type-body-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary underline underline-offset-4">
            Log in
          </Link>
        </p>
      </section>
    </MarketingLayout>
  );
}
