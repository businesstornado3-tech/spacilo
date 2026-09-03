# Phase 9 — Intelligent Discovery + SEO Engine

## Goal
Build a reusable, product-led discovery system that understands multi-dimensional intent, maps it to the smallest useful EarnRoom capability path, enriches it with truthful marketplace supply, and controls SEO publication without keyword/location page sprawl.

## User-facing experience
- Add capability-first public routes for the five current capabilities under `/tools/*`.
- Add one reusable intent discovery route at `/discover` that accepts a natural-language query, shows the detected intent, best capability sequence, and a truthful next step.
- Add a location-aware route at `/storage/$location` only for canonical UK places with real published supply; zero-supply locations resolve to a useful capability/search experience without availability claims.
- Keep all existing routes functional and add focused contextual links using the existing design system and brand configuration.

## Intelligence primitives
- Intent taxonomy with extensible dimensions: role, objective, belongings, space, location, timeframe and journey stage.
- Deterministic phrase/evidence classifier with multi-intent output and UK location extraction.
- Capability registry/graph for Item Scanner, Space Scanner, SpacePlanner, Space Estimate and Location Search, including truthful inputs, limits, CTAs and next capabilities.
- Traceable scoring and canonical intent clustering to select a primary capability, ordered secondary capabilities, journey, canonical experience and indexability status.
- Opportunity records and quality gates for future observed queries/capabilities; no automatic page generation, fake volume or fabricated supply.

## SEO and trust controls
- Shared metadata, WebPage/BreadcrumbList/ItemList structured-data helpers for the new public experiences.
- Sitemap inclusion driven only by explicit indexability and real published location supply; no query URLs or private paths.
- Preserve and audit existing robots rules; keep authenticated routes excluded.
- Analytics additions use the existing privacy-first taxonomy and sanitisation, recording only capability/route/status enums and no raw search text.
- Add a server-side IndexNow preparation contract that refuses client use and reports manual setup when no key is configured; do not claim submissions occurred.

## Verification
- Add focused tests covering classification, multi-intent, capability ranking, locations, supply/no-supply, scoring, canonicalisation, indexability, metadata/schema, links, analytics attribution and security exclusions.
- Run the full test suite, typecheck and production build only after implementation. Do not alter payments, Connect, webhooks, refunds, disputes, payouts, VAT, SpacePlanner calculation/placement, location/geocoding logic, branding or production domain.
