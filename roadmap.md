# Phase 7C — EarnRoom migration

- [x] Complete UK-wide brand and positioning copy migration
- [x] Align structured metadata and public manifest with EarnRoom
- [x] Audit and update legal, privacy, cookies, AI and disclaimer surfaces using implemented behaviour
- [x] Publish current storage-policy wording (version 1.1.0) without altering frozen Phase 7B search logic
- [x] Run legacy-string audit, focused tests, full tests, typecheck and build checks
- [x] Implement the supplied approved EarnRoom lockup, wordmark and icon across navigation, footer, AI, email, PWA, favicon and social surfaces
- [x] Set the canonical tagline to “Make space earn.” and remove the legacy rollback block

Open items for the owner (not code work):

- No registered legal entity confirmed — legal pages must not assert one until supplied.
- `hello@earnroom.example` is a placeholder support address.
- Legal, privacy and cookies copy still requires qualified UK review before launch.
- No account-deletion / data-request workflow exists; privacy copy states this openly.

## Phase 8F — commercial and VAT policy freeze

- [x] Freeze platform fee at max(£5.00, 12%) and host payout hold at 7 calendar days
- [x] Record VAT as 20% standard rate, inactive and pending adviser confirmation
- [x] Preserve platform refund/chargeback loss bearer and existing payment safety flows
- [x] Add zero/unknown VAT snapshots for future readiness without changing checkout totals
- [ ] Confirm UK VAT treatment with a qualified adviser before any VAT activation

## Phase 11 — autonomous opportunity, campaign and growth engine

- [x] Define open-ended opportunity, audience, intent, supply, campaign, policy and learning contracts
- [x] Register connector permissions with first-party-only analysis and blocked unauthorised marketplace automation
- [x] Persist opportunities, insights, learning signals, campaigns, autonomy configuration and append-only audit events
- [x] Build deterministic, evidence-backed opportunity scoring with zero-supply-safe recommendations
- [x] Add idempotent first-party analytics ingestion with bounded server-side refresh
- [x] Add Founder Dashboard growth radar with admin-only refresh and honest empty/error states
- [x] Keep outbound sending disabled and all campaign decisions capture-only
- [x] Verify privacy filtering, blocked connectors, supply claims, emergency stop and repeat aggregation with regression tests
- [ ] Add separately authorised connectors only after legal, terms and consent review

## Public AI provider terminology cleanup

- [ ] Replace unnecessary provider/platform names in public privacy and AI-disclaimer copy with accurate provider-neutral disclosure
- [ ] Verify public routes and UI expose no other provider/platform names without changing AI, admin, geography, analytics or marketplace behaviour
- [ ] Run the full test suite, typecheck, build and public runtime/console checks

## Phase 12 — autonomous marketing & growth intelligence

- [x] Brand profile, SEO topic catalogue, demand-creation seeds and market-intelligence adapters
- [x] Daily orchestrator that always produces a campaign, with reasons and evidence for every choice
- [x] Story engine, per-platform assets, coverage and duplication protection
- [x] Pre-publication validation: claims, availability, statistics, UK conventions, personal data, licensing
- [x] Platform capability detection, publication state machine, retries and honest "requires configuration" states
- [x] Video provider abstraction with an honest not-configured failure
- [x] Founder-only storage (campaigns, publications, connections, performance, audit) with admin-only access
- [x] Marketing studio in the founder console: generate, review, approve, reject, attempt publication
- [x] Performance ingestion and a learning loop that changes recommendations only
- [x] Real video generation: prompt builder, generation service, private storage, brand overlay and validation
- [x] Cost and usage limits on generation (per day, per campaign, per asset)
- [x] Official OAuth connection architecture, per-platform publishing modes, connection testing
- [x] Video preview and Accounts & publishing sections in the marketing studio
- [x] Zero-fee generation: open-weight model selection with a recorded licence check (Wan 2.2, Apache-2.0)
- [x] Provider-neutral routing — own worker by default, paid service only when chosen and confirmed per video
- [x] GPU queue admission, cancellation, media probing of the finished file, shared core film per frame shape
- [x] Cost shown split: video API fee vs infrastructure time, never guessed
- [ ] Stand up the video worker (address + access token) so self-hosted generation can actually run
- [ ] Connect real social platform accounts before anything can actually publish

## Phase 12c — self-hosted Wan 2.2 worker
- [x] Deployable worker service (`worker/wan22/`): FastAPI, bearer auth, queue, cancel, ffprobe validation, ffmpeg brand compositing, shared core film reuse
- [x] Pinned checkpoint + licence record (Wan-AI/Wan2.2-TI2V-5B-Diffusers @ b8fff73…, Apache-2.0, verified 2026-09-06)
- [x] Worker status in the Founder Console: Connected / Not configured / Offline / Authentication failed / Worker error, with video fee and infrastructure cost shown separately
- [x] Branding burn-in proven on a real MP4 (worker/wan22/test_worker.py)
- [ ] Rent/stand up the GPU host, set VIDEO_WORKER_URL + VIDEO_WORKER_TOKEN, run the first real Wan 2.2 generation end to end
