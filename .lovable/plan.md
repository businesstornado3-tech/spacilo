# Spacilo AI Space Planner — platform feature

Turn today's homepage planner into one shared, reusable planner used by visitors, renters and hosts. One engine, one component set, three modes.

## Approach

The existing deterministic engine in `src/lib/spaceplanner` (catalogue, packing, metrics, explanations) already produces everything the planner needs. It stays the single source of truth. What is missing is a shared context, a capability model, persistence, and the renter/host surfaces.

### Capability modes

| Mode | Who | Items | Photos/AI | Save | Compare | Book |
|---|---|---|---|---|---|---|
| `visitor` | logged out | 4 max | no | no | no | no |
| `renter` | signed in | unlimited | yes | yes | yes | yes |
| `host` | signed in host | from request | yes | yes | n/a | accept/decline |

One `PlannerCapabilities` object drives every gate, so no component branches on auth directly.

## Phase 1 — Shared planner core (foundation)

- `SpacePlannerProvider` — context holding inventory lines, chosen space, capabilities, run state, recommendations, current plan. All state transitions go through it.
- Refactor the existing pieces into the named component set, keeping current visuals:
  - `PlannerCanvas` (from `LayoutSimulation`/`PlanScene`)
  - `InventoryPanel` (from `InventoryBuilder`)
  - `StoragePanel` (from `StorageSelector`)
  - `AIProgressPanel` (from `AIThinkingTimeline`, with recognition/packing/space-saved/fit bars)
  - `RecommendationPanel` (from `explain.ts`, extended)
  - `FitScore` — the Spacilo AI Score band component (98 Excellent … 35 Not recommended)
  - `PlannerToolbar` — mode-aware actions
- `ScanUploader`, `SavedPlans`, `BookingSummary`, `HostReviewPanel` are created in this phase as capability-gated shells and filled in later phases.
- Homepage keeps its current look but is rebuilt on these components in `visitor` mode with the 4-item cap and the unlock card shown after the first completed run (never before).
- Planner modules lazy-loaded and code-split so homepage weight does not grow.

## Phase 2 — Recommendations, scoring and animation

- Extend the rules engine to emit the full recommendation set (rotate bike, wardrobe upright, stack boxes, vertical storage, mattress upright, fragile higher, heavy lower, walkway, reduce floor area), each tied to a real placement.
- Spacilo AI Score: deterministic composite of fit, door clearance, walkway, ceiling, weight and packing complexity, with named bands.
- Motion pass: spring-style transitions on placements — slide, rotate, stack, no teleporting, no overlaps, reduced-motion respected, 60fps target.

## Phase 3 — Renter: saved inventories and plans

- Reuse the existing `renter_inventories` / `inventory_items` tables for belongings; add a `planner_plans` table (name, inventory ref, space snapshot, result snapshot, fit score, created date) plus a `planner_sessions` history table. RLS scoped to the owner, with GRANTs.
- `SavedPlans`: create, rename, duplicate, delete, unlimited.
- `ScanUploader`: photo capture, drag and drop, and AI recognition wired to the existing inventory photo analysis pipeline — no second AI implementation.
- Compare mode: several spaces against one inventory, side by side on price, free space and fit score.

## Phase 4 — Listing and booking confidence

- "Will my belongings fit? — Launch Spacilo AI" on every listing, preloading the listing's real dimensions, door width, ceiling height, access and rules.
- Renter picks a saved inventory; planner returns fit %, free space, walkway, door clearance and packing order.
- `BookingSummary` — the AI Compatibility Score panel shown before payment, reusing the existing price and safety layers untouched.

## Phase 5 — Host

- `HostReviewPanel` on every incoming request: host space + guest inventory, required area, remaining space, unload path, clearances, estimated unload time, and an Accept / Accept with changes / Decline recommendation.
- Host recommendations set, phrased for the host.
- Digital Twin: host scans once; the space model (dimensions, door, shelves, obstacles, ceiling) is stored on the space and reused by every future booking. Built on the existing host scan and measurement-proposal flow.

## Future-proofing (architecture only, nothing built now)

- Renderer is an interface — the current SVG canvas is one implementation, so a Three.js/AR renderer can be dropped in later.
- Engine stays behind the `SpacePlannerEngine` interface, so photogrammetry/LiDAR/server optimisation can replace it.
- Capability flags leave room for premium tiers; no subscription code is written.

## Technical notes

- No new AI service. Recognition reuses the existing Spacilo AI vision pipeline; packing stays deterministic and unit-tested.
- All existing safety, policy, trust, pricing and booking layers from earlier prompts are preserved and called, not reimplemented.
- Existing tests must keep passing; each phase adds its own.

## Sequencing

Phases are delivered one at a time, each landing in a working state. Phase 1 is the largest and unlocks the rest.
