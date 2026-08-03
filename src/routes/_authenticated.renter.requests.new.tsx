/**
 * Review and send a storage request for a published space.
 * Nothing here reserves capacity — it's a structured enquiry the host can
 * accept or ignore, and it expires after 48 hours.
 */
import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/form/Field";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { toast } from "@/components/overlay/toast";
import { useActiveInventory, useInventoryItems, useInventorySummary } from "@/hooks/useInventory";
import { useSpaceFitForSpace } from "@/hooks/useSpaceFitMatches";
import { useCreateRequest } from "@/hooks/useStorageRequests";
import { getPublishedSpace } from "@/lib/spaces-api";
import { toMatchSpace } from "@/lib/spacefit/adapters";
import { publicLocation, spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import { track } from "@/lib/analytics";
import {
  REQUEST_DISCLAIMER,
  REQUEST_NOTE_MAX,
  addDays,
  formatApproximateDuration,
  hasDateErrors,
  toDateInput,
  validateRequestDates,
} from "@/lib/storage-requests";

export const Route = createFileRoute("/_authenticated/renter/requests/new")({
  validateSearch: (search: Record<string, unknown>): { spaceId?: string } =>
    typeof search["spaceId"] === "string" ? { spaceId: search["spaceId"] } : {},
  head: () => ({
    meta: [
      { title: "Send a storage request — " + brand.name },
      { name: "description", content: "Review your dates, belongings and price, then send your storage request to the host." },
      { property: "og:title", content: "Send a storage request — " + brand.name },
      { property: "og:description", content: "Review your dates, belongings and price, then send your storage request to the host." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewRequestPage,
});

type SpaceRow = Awaited<ReturnType<typeof getPublishedSpace>>;

function NewRequestPage() {
  const { spaceId } = Route.useSearch();
  const navigate = useNavigate();

  const [space, setSpace] = React.useState<SpaceRow | null>(null);
  const [loadState, setLoadState] = React.useState<"loading" | "ready" | "missing" | "error">("loading");

  const today = React.useMemo(() => new Date(), []);
  const [startDate, setStartDate] = React.useState(toDateInput(addDays(today, 7)));
  const [endDate, setEndDate] = React.useState(toDateInput(addDays(today, 97)));
  const [note, setNote] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const { data: inventory } = useActiveInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const summary = useInventorySummary(items);
  const matchSpace = React.useMemo(() => (space ? toMatchSpace(space) : null), [space]);
  const { result } = useSpaceFitForSpace(matchSpace);
  const create = useCreateRequest();

  const load = React.useCallback(async () => {
    if (!spaceId) return setLoadState("missing");
    setLoadState("loading");
    try {
      const row = await getPublishedSpace(spaceId);
      if (!row) return setLoadState("missing");
      setSpace(row);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [spaceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dateErrors = validateRequestDates(startDate, endDate, today);
  const showErrors = submitted;
  const hasItems = (items?.length ?? 0) > 0;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasDateErrors(dateErrors) || !space || !inventory) return;
    try {
      const request = await create.mutateAsync({
        spaceId: space.id,
        inventoryId: inventory.id,
        startDate,
        endDate,
        ...(note.trim() ? { note: note.trim() } : {}),
        spaceFit: result,
      });
      track("storage_request_submitted", { space_id: space.id });
      toast.success("Request sent", "The host has 48 hours to respond.");
      void navigate({ to: "/renter/requests/$requestId", params: { requestId: request.id } });
    } catch (error) {
      toast.error(
        "We couldn't send that request",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  return (
    <AppLayout
      mode="renter"
      title="Send a storage request"
      description="Check the details below. Sending a request doesn't book the space or take payment."
    >
      {loadState === "loading" ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {loadState === "error" ? <ErrorState onRetry={() => void load()} /> : null}

      {loadState === "missing" ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <h2 className="type-h3">This space isn&apos;t available</h2>
          <p className="mt-2 type-body-sm text-muted-foreground">
            It may have been paused or removed by the host.
          </p>
          <Button asChild className="mt-5">
            <Link to="/renter/search">Find another space</Link>
          </Button>
        </div>
      ) : null}

      {loadState === "ready" && space ? (
        <div className="max-w-2xl space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="type-h3">{space.title ?? "Storage space"}</h2>
            <p className="mt-1 type-body-sm text-muted-foreground">
              {spaceTypeLabel(space.space_type as SpaceTypeValue)} ·{" "}
              {publicLocation(space.approximate_area, space.postcode_district)}
            </p>
            <PriceDisplay amount={space.monthly_price_pence ?? 0} className="mt-3" />
            {result ? (
              <p className="mt-2 type-body-sm text-muted-foreground">
                {result.compatible
                  ? `${result.score}% SpaceFit — ${result.label}`
                  : "SpaceFit says this space may not suit your belongings."}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="type-h3">What you&apos;re storing</h2>
            {hasItems ? (
              <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="type-label text-muted-foreground">Items</dt>
                  <dd className="mt-1 type-body tabular-nums">{summary.totals.itemCount}</dd>
                </div>
                <div>
                  <dt className="type-label text-muted-foreground">Estimated space needed</dt>
                  <dd className="mt-1 type-body tabular-nums">
                    {summary.totals.storageRequirementM3.toFixed(2)} m³
                  </dd>
                </div>
              </dl>
            ) : (
              <>
                <p className="mt-2 type-body-sm text-muted-foreground">
                  Add what you&apos;re storing so the host can judge whether their space suits it.
                </p>
                <Button asChild className="mt-4">
                  <Link to="/renter/inventory">Add my stuff</Link>
                </Button>
              </>
            )}
          </section>

          <form onSubmit={onSubmit} className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
              <h2 className="type-h3">When do you need it?</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Start date"
                  htmlFor="request-start"
                  required
                  {...(showErrors && dateErrors.start ? { error: dateErrors.start } : {})}
                >
                  <TextInput
                    id="request-start"
                    type="date"
                    value={startDate}
                    min={toDateInput(today)}
                    invalid={showErrors && Boolean(dateErrors.start)}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </Field>
                <Field
                  label="End date"
                  htmlFor="request-end"
                  required
                  {...(showErrors && dateErrors.end ? { error: dateErrors.end } : {})}
                >
                  <TextInput
                    id="request-end"
                    type="date"
                    value={endDate}
                    min={startDate || toDateInput(today)}
                    invalid={showErrors && Boolean(dateErrors.end)}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </Field>
              </div>
              {!hasDateErrors(dateErrors) ? (
                <p className="type-body-sm text-muted-foreground">
                  {formatApproximateDuration(startDate, endDate)} at{" "}
                  {space.monthly_price_pence ? "" : "an unpublished "}monthly price.
                </p>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <Field
                label="Message to the host (optional)"
                htmlFor="request-note"
                hint="Anything useful — access needs, flexibility on dates, what you're storing."
              >
                <TextArea
                  id="request-note"
                  value={note}
                  maxLength={REQUEST_NOTE_MAX}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Hi, I'm storing a few boxes and a sofa while I move."
                />
              </Field>
              <p className="mt-1 type-body-sm text-muted-foreground tabular-nums">
                {note.length}/{REQUEST_NOTE_MAX}
              </p>
            </section>

            <p className="type-body-sm text-muted-foreground">{REQUEST_DISCLAIMER}</p>

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={!hasItems || create.isPending}
                className="w-full sm:w-auto"
              >
                {create.isPending ? "Sending…" : "Send request"}
              </Button>
              <Button asChild variant="ghost" className="w-full sm:w-auto">
                <Link to="/spaces/$spaceId" params={{ spaceId: space.id }}>
                  Back to the listing
                </Link>
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </AppLayout>
  );
}
