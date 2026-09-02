import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Boxes, Inbox, MapPinOff, PackageCheck, ShieldCheck } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/common/Alert";
import { Tabs } from "@/components/common/Tabs";
import { EmptyState, ErrorState } from "@/components/common/States";
import { ListingCardSkeleton, ListSkeleton } from "@/components/common/Skeletons";
import { ProgressBar, StepProgress } from "@/components/common/Progress";
import { PhotoUploader } from "@/components/common/PhotoUploader";
import { Field, TextInput, TextArea, NativeSelect } from "@/components/form/Field";
import { CheckboxField, RadioField, ToggleField } from "@/components/form/Controls";
import { SearchField, PostcodeSearch } from "@/components/form/SearchFields";
import { Modal, BottomSheet } from "@/components/overlay/Modal";
import { toast } from "@/components/overlay/toast";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { BookingCard } from "@/components/marketplace/BookingCard";
import { InventoryItemCard } from "@/components/marketplace/InventoryItemCard";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { Rating, Review } from "@/components/marketplace/Rating";
import { StatusBadge } from "@/components/marketplace/StatusBadge";
import { ProfileCard } from "@/components/user/ProfileCard";
import { SpaceFitBadge, SpaceFitMeter } from "@/components/trust/SpaceFit";
import {
  VerificationBadge,
  VERIFICATION_DISCLAIMER,
} from "@/components/trust/VerificationBadge";
import { SpaceFitAiMark, SpaceFitScanning, SpaceFitResult, AnimatedSpaceFitScore } from "@/components/trust/SpaceFitAI";
import { TrustIndicatorRow, TrustCard } from "@/components/trust/TrustIndicators";
import { CardCarousel } from "@/components/marketplace/Carousel";
import { SpaceCategoryCard } from "@/components/marketplace/SpaceCategoryCard";
import { AccessIndicator } from "@/components/marketplace/AccessIndicator";
import { HostEarningsCard } from "@/components/host/HostEarningsCard";
import garagePhoto from "@/assets/sample-garage.jpg";
import roomPhoto from "@/assets/sample-spare-room.jpg";
import shedPhoto from "@/assets/sample-shed.jpg";
import loftPhoto from "@/assets/sample-loft.jpg";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: `Design system — ${brand.name}` },
      {
        name: "description",
        content: `Internal showcase of ${brand.name} typography, colour tokens, buttons, form controls, trust badges, fit and marketplace cards.`,
      },
      { property: "og:title", content: `Design system — ${brand.name}` },
      {
        property: "og:description",
        content: "Internal component and design token showcase.",
      },
    ],
  }),
  component: DesignSystemPage,
});

function Block({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-10 first:border-t-0">
      <h2 className="type-h2">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-prose type-body-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

const swatches = [
  ["Background", "bg-background"],
  ["Surface", "bg-surface"],
  ["Primary", "bg-primary"],
  ["Primary soft", "bg-primary-soft"],
  ["Accent", "bg-accent"],
  ["Success", "bg-success"],
  ["Warning", "bg-warning"],
  ["Destructive", "bg-destructive"],
  ["Info", "bg-info"],
  ["Signal", "bg-signal"],
  ["Accent soft", "bg-accent-soft"],
  ["Muted", "bg-muted"],
];

function DesignSystemPage() {
  const [tab, setTab] = React.useState("renter");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [toggle, setToggle] = React.useState(true);

  return (
    <MarketingLayout>
      <PageSection>
        <Badge variant="subtle">Internal</Badge>
        <h1 className="mt-4 type-h1">{brand.name} design system</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">
          Every token, control and marketplace component in one place. Colours, type and spacing are
          defined centrally in <code className="rounded bg-secondary px-1.5 py-0.5">styles.css</code>.
        </p>

        <Block title="Typography" description="Display face: Sora. Body face: Manrope.">
          <div className="space-y-4">
            <p className="type-hero">Your stuff. Space nearby.</p>
            <p className="type-h1">Section heading</p>
            <p className="type-h2">Sub-section heading</p>
            <p className="type-h3">Card group heading</p>
            <p className="type-card-title">Listing card title</p>
            <p className="type-body max-w-prose">
              Body text. Storage between people, built around trust — clear, calm and easy to read on
              a small phone as well as a large screen.
            </p>
            <p className="type-body-sm text-muted-foreground">Small supporting body text.</p>
            <p className="type-label">Form label</p>
            <p className="type-overline text-muted-foreground">Overline / eyebrow</p>
            <p className="type-price">£49</p>
          </div>
        </Block>

        <Block title="Colour" description="Restrained palette with green for success and red reserved for errors.">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {swatches.map(([name, cls]) => (
              <li key={name}>
                <div className={`h-16 rounded-xl border border-border ${cls}`} />
                <p className="mt-1.5 type-body-sm text-muted-foreground">{name}</p>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="text">Text button</Button>
            <Button variant="subtle">Subtle</Button>
            <Button variant="success">Confirm booking</Button>
            <Button variant="destructive">Cancel booking</Button>
            <Button variant="outline">Outline</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </Block>

        <Block title="Search and postcode entry">
          <div className="grid gap-6 md:grid-cols-2">
            <SearchField label="Search spaces" placeholder="Garage, loft, shed…" buttonLabel="Search" />
            <PostcodeSearch hint="UK postcodes only, e.g. PO4 8LB." />
          </div>
        </Block>

        <Block title="Form controls">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-5">
              <Field label="Full name" htmlFor="ds-name" required>
                <TextInput id="ds-name" placeholder="Alex Morgan" autoComplete="name" />
              </Field>
              <Field
                label="Monthly price"
                htmlFor="ds-price"
                hint="Set the price you'd like to receive each month."
              >
                <TextInput id="ds-price" inputMode="decimal" placeholder="£49" />
              </Field>
              <Field label="Email" htmlFor="ds-email" error="Enter a valid email address">
                <TextInput id="ds-email" type="email" invalid defaultValue="not-an-email" />
              </Field>
              <Field label="Space type" htmlFor="ds-type">
                <NativeSelect id="ds-type" defaultValue="garage">
                  <option value="garage">Garage</option>
                  <option value="room">Spare room</option>
                  <option value="loft">Loft</option>
                  <option value="shed">Shed</option>
                  <option value="warehouse">Warehouse</option>
                </NativeSelect>
              </Field>
              <Field label="Description" htmlFor="ds-desc">
                <TextArea id="ds-desc" placeholder="Tell renters about your space…" />
              </Field>
            </div>
            <div className="space-y-4">
              <fieldset>
                <legend className="type-label">Security features</legend>
                <CheckboxField id="ds-cctv" label="CCTV" defaultChecked />
                <CheckboxField id="ds-alarm" label="Alarmed" description="Monitored alarm system" />
                <CheckboxField id="ds-dry" label="Dry and weatherproof" />
              </fieldset>
              <fieldset>
                <legend className="type-label">Access</legend>
                <RadioField id="ds-access-1" name="ds-access" label="By arrangement" defaultChecked />
                <RadioField id="ds-access-2" name="ds-access" label="Daytime only" />
                <RadioField id="ds-access-3" name="ds-access" label="24/7 access" />
              </fieldset>
              <ToggleField
                id="ds-toggle"
                label="Instant enquiries"
                description="Let renters message you before booking."
                checked={toggle}
                onCheckedChange={setToggle}
              />
              <PhotoUploader
                photos={[
                  { id: "1", url: garagePhoto, alt: "Empty white-brick garage with concrete floor" },
                ]}
              />
            </div>
          </div>
        </Block>

        <Block title="Trust badges" description={VERIFICATION_DISCLAIMER}>
          <div className="flex flex-wrap gap-2">
            <VerificationBadge type="email" />
            <VerificationBadge type="phone" />
            <VerificationBadge type="id" />
            <VerificationBadge type="address" />
            <VerificationBadge type="space" />
            <VerificationBadge type="payment" />
            <VerificationBadge type="generic" />
            <VerificationBadge type="id" pending />
          </div>
        </Block>

        <Block
          title="Fit"
          description="An estimated compatibility score between declared belongings and a space — never a guarantee."
        >
          <div className="flex flex-wrap gap-2">
            <SpaceFitBadge score={96} />
            <SpaceFitBadge score={82} />
            <SpaceFitBadge score={67} />
            <SpaceFitBadge score={48} />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <SpaceFitMeter score={96} />
            <SpaceFitMeter score={67} />
          </div>
        </Block>

        <Block
          title="EarnRoom AI"
          description="The intelligent layer of the product: a scanning state, an analysis summary and an animated score. Always framed as an estimate."
        >
          <div className="flex flex-wrap items-center gap-3">
            <SpaceFitAiMark />
            <SpaceFitAiMark size="sm" />
            <SpaceFitAiMark tone="plain" />
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <SpaceFitScanning />
            <SpaceFitResult
              analysis={{ itemCount: 12, estimatedVolumeM3: 5.4, nearbySpaceCount: 11, score: 96 }}
            />
          </div>
          <div className="mt-6 flex flex-wrap items-end gap-8">
            <AnimatedSpaceFitScore score={96} size="lg" />
            <AnimatedSpaceFitScore score={78} />
            <AnimatedSpaceFitScore score={54} size="sm" />
          </div>
        </Block>

        <Block
          title="Trust indicators"
          description="Reassurance woven into the interface — compact chips and editorial cards rather than security shields."
        >
          <TrustIndicatorRow kinds={["secure_payment", "digital_inventory", "address_hidden", "cover"]} />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <TrustCard icon={ShieldCheck} title="Checks, not promises">
              We verify ID, address and the space itself. Verification confirms a check happened.
            </TrustCard>
            <TrustCard icon={PackageCheck} title="Digital inventory">
              Photograph what you store. Both sides agree the list before handover.
            </TrustCard>
            <TrustCard icon={MapPinOff} title="Address stays private" tone="accent">
              Only the approximate area is shown until a booking is confirmed.
            </TrustCard>
          </div>
        </Block>

        <Block title="Access indicators">
          <div className="flex flex-wrap items-center gap-3">
            <AccessIndicator level="24_7" />
            <AccessIndicator level="daytime" />
            <AccessIndicator level="by_arrangement" />
            <AccessIndicator level="24_7" compact />
          </div>
        </Block>

        <Block
          title="Host earnings"
          description="Aspirational, on the warm accent surface, and clearly illustrative."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <HostEarningsCard amount={8500} ctaLabel="List my space" />
            <HostEarningsCard
              headline="Your unused loft could earn"
              amount={4200}
              note="Illustrative estimate based on nearby listings"
            />
          </div>
        </Block>

        <Block title="Status, price and rating">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status="pending_host" />
            <StatusBadge status="confirmed" />
            <StatusBadge status="active" />
            <StatusBadge status="completed" />
            <StatusBadge status="declined" />
            <StatusBadge status="paid" />
            <StatusBadge status="payout_scheduled" />
            <StatusBadge status="listed" />
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-8">
            <PriceDisplay amount={4900} size="lg" />
            <PriceDisplay amount={12550} />
            <PriceDisplay amount={899} size="sm" period="week" />
            <Rating value={4.9} reviewCount={27} />
          </div>
        </Block>

        <Block title="Listing cards">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <ListingCard
              id="1"
              title="Garage Space"
              spaceTypeLabel="Garage"
              areaName="Southsea"
              distanceMiles={0.6}
              areaSqFt={150}
              pricePerMonth={4900}
              rating={4.9}
              reviewCount={27}
              hostVerified
              spaceFitScore={96}
              securityFeatures={["cctv", "locked_door", "dry", "vehicle_access"]}
              photoUrl={garagePhoto}
              photoAlt="Empty white-brick garage with a concrete floor and side window"
            />
            <ListingCard
              id="2"
              title="Dry Loft Room"
              spaceTypeLabel="Loft"
              areaName="Fratton"
              distanceMiles={1.4}
              areaSqFt={80}
              pricePerMonth={3200}
              rating={4.7}
              reviewCount={11}
              hostVerified
              spaceFitScore={78}
              securityFeatures={["locked_door", "dry", "lighting"]}
              photoUrl={loftPhoto}
              photoAlt="Converted loft with wooden floor and neatly stacked storage boxes"
            />
            <ListingCardSkeleton />
          </div>
        </Block>


        <Block
          title="Mobile carousel and categories"
          description="Cards snap horizontally on touch devices. Category tiles are photography-led."
        >
          <CardCarousel title="Spaces near PO4" ariaLabel="Nearby spaces">
            <ListingCard
              id="c1"
              title="Garage Space"
              areaName="Southsea"
              distanceMiles={0.6}
              pricePerMonth={4900}
              rating={4.9}
              reviewCount={27}
              hostVerified
              spaceFitScore={96}
              securityFeatures={["cctv", "dry", "vehicle_access"]}
              photoUrl={garagePhoto}
              photoAlt="Empty white-brick garage with a concrete floor"
            />
            <ListingCard
              id="c2"
              title="Spare Room"
              areaName="Milton"
              distanceMiles={1.1}
              pricePerMonth={3800}
              rating={4.8}
              reviewCount={9}
              hostVerified
              spaceFitScore={88}
              securityFeatures={["locked_door", "dry", "ground_floor"]}
              photoUrl={roomPhoto}
              photoAlt="Bright spare room with stacked boxes, a suitcase and a bicycle"
            />
            <ListingCard
              id="c3"
              title="Garden Shed"
              areaName="Fratton"
              distanceMiles={1.9}
              pricePerMonth={2200}
              rating={4.6}
              reviewCount={5}
              spaceFitScore={64}
              securityFeatures={["locked_door", "lighting"]}
              photoUrl={shedPhoto}
              photoAlt="Tidy wooden garden shed interior with bikes and storage boxes"
            />
          </CardCarousel>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SpaceCategoryCard label="Garages" meta="24 nearby" photoUrl={garagePhoto} photoAlt="UK garage interior" />
            <SpaceCategoryCard label="Spare rooms" meta="18 nearby" photoUrl={roomPhoto} photoAlt="Spare room used for storage" />
            <SpaceCategoryCard label="Lofts" meta="9 nearby" photoUrl={loftPhoto} photoAlt="Converted loft with storage boxes" />
            <SpaceCategoryCard label="Sheds" meta="12 nearby" photoUrl={shedPhoto} photoAlt="Garden shed interior" />
          </div>
        </Block>

        <Block title="People and bookings">
          <div className="grid gap-5 lg:grid-cols-2">
            <ProfileCard
              name="Priya S."
              role="host"
              areaName="Southsea, Portsmouth"
              memberSince="March 2026"
              bio="I have a dry double garage I no longer use for the car. Happy to arrange access at short notice."
              rating={4.9}
              reviewCount={27}
              verifications={["id", "address", "space", "payment"]}
              stats={[
                { label: "Response rate", value: "98%" },
                { label: "Responds in", value: "2 hrs" },
                { label: "Spaces", value: "2" },
              ]}
              actions={<Button size="sm">Message host</Button>}
            />
            <ProfileCard
              name="Daniel O."
              role="renter"
              areaName="Milton, Portsmouth"
              memberSince="April 2026"
              bio="Storing furniture between house moves."
              rating={5}
              reviewCount={3}
              verifications={["email", "phone", "id"]}
            />
            <BookingCard
              reference="STW-10428"
              spaceTitle="Garage Space"
              areaName="Southsea"
              counterpartyName="Priya S."
              counterpartyRole="Host"
              status="active"
              startDate="2026-05-01"
              monthlyPrice={4900}
              photoUrl={garagePhoto}
              photoAlt="Empty white-brick garage"
              actions={
                <>
                  <Button size="sm" variant="secondary">
                    Message
                  </Button>
                  <Button size="sm">View booking</Button>
                </>
              }
            />
            <div className="space-y-3">
              <InventoryItemCard
                name="Two-seater sofa"
                categoryLabel="Furniture"
                quantity={1}
                dimensions="180 × 85 × 80 cm"
                volumeM3={1.22}
                isAiEstimated
              />
              <InventoryItemCard
                name="Medium boxes"
                categoryLabel="Boxes"
                quantity={12}
                dimensions="45 × 45 × 40 cm"
                volumeM3={0.97}
              />
            </div>
          </div>
          <Review
            className="mt-5 max-w-2xl"
            authorName="Hannah W."
            rating={5}
            date="12 April 2026"
            body="Really easy handover, the garage was dry and exactly as described. Access was straightforward every time."
          />
        </Block>

        <Block title="Feedback: alerts, toasts, overlays">
          <div className="grid gap-3 md:grid-cols-2">
            <Alert tone="info" title="Address stays private">
              The full address is shared only once a booking is confirmed.
            </Alert>
            <Alert tone="success" title="ID verification complete">
              Your identity check was completed successfully.
            </Alert>
            <Alert tone="warning" title="Add photos to publish">
              Your listing needs at least three photos before it can go live.
            </Alert>
            <Alert tone="error" title="Payment failed">
              We couldn't take this month's payment. Update your payment method to continue.
            </Alert>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open bottom sheet
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.success("Booking request sent", "Priya usually replies in 2 hours.")}
            >
              Show toast
            </Button>
          </div>
        </Block>

        <Block title="Tabs">
          <Tabs
            items={[
              { id: "renter", label: "For renters" },
              { id: "host", label: "For hosts" },
            ]}
            value={tab}
            onValueChange={setTab}
          >
            <p className="type-body-sm text-muted-foreground">
              {tab === "renter" ? brand.propositions.renter : brand.propositions.host}
            </p>
          </Tabs>
        </Block>

        <Block title="Progress">
          <div className="max-w-xl space-y-6">
            <ProgressBar value={64} label="Listing completeness" />
            <StepProgress steps={["Space", "Photos", "Pricing", "Review"]} current={1} />
          </div>
        </Block>

        <Block title="Empty, loading and error states">
          <div className="grid gap-5 lg:grid-cols-3">
            <EmptyState
              icon={Inbox}
              title="No bookings yet"
              description="When you book a space, it'll appear here with its check-in details."
              actionLabel="Find storage"
            />
            <ErrorState onRetry={() => toast.info("Retrying…")} />
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="type-label mb-3 text-muted-foreground">Loading skeleton</p>
              <ListSkeleton rows={2} />
            </div>
          </div>
          <EmptyState
            className="mt-5"
            icon={Boxes}
            title="Your inventory is empty"
            description="Photograph your belongings and we'll estimate the space you need."
          />
        </Block>
      </PageSection>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Confirm your booking request"
        description="Priya will review your declared belongings before accepting."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Back
            </Button>
            <Button onClick={() => setModalOpen(false)}>Send request</Button>
          </>
        }
      >
        <SpaceFitMeter score={96} showDisclaimer={false} />
      </Modal>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Filters"
        description="Narrow your results by price, size and features."
        footer={
          <>
            <Button block onClick={() => setSheetOpen(false)}>
              Show results
            </Button>
            <Button variant="text" block onClick={() => setSheetOpen(false)}>
              Clear all
            </Button>
          </>
        }
      >
        <CheckboxField id="ds-sheet-1" label="Vehicle access" />
        <CheckboxField id="ds-sheet-2" label="CCTV" />
        <CheckboxField id="ds-sheet-3" label="Ground floor" />
      </BottomSheet>
    </MarketingLayout>
  );
}
