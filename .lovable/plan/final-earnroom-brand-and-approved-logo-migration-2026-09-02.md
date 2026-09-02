# Final EarnRoom brand and approved logo migration

## Outcome

Make the supplied EarnRoom artwork the production visual source of truth, set “Make space earn.” as the canonical primary tagline, and remove unexplained legacy branding without changing product behaviour.

## Implementation

1. **Create faithful production assets**
   - Preserve the supplied high-resolution artwork without redrawing it.
   - Produce tightly cropped, proportionally scaled full-lockup assets for desktop/footer and wordmark lockups for constrained headers.
   - Crop the exact supplied house/hexagon/$ icon for compact navigation, favicon, Apple touch icon, and manifest use.
   - Upload reusable brand artwork through the project asset flow; keep only correctly sized real favicon/app files in `public/`.

2. **Replace logo components everywhere**
   - Refactor the shared `Logo` component to render the approved image asset, with responsive full/compact variants and accessible naming.
   - Apply it automatically to public, authenticated, admin, mobile, footer, and authentication shells that already consume the shared component.
   - Remove production use of the current component-drawn substitute mark; retain compatibility exports only where needed during migration.
   - Update the small EarnRoom AI lockup so EarnRoom remains visually primary and AI stays subordinate.

3. **Canonical copy and metadata**
   - Set `brand.tagline` to exactly “Make space earn.” and update its tests.
   - Update manifest, browser/app naming, route metadata defaults, structured data, accessibility labels, and public social artwork.
   - Keep `SpacePlanner` unchanged as the feature name and use `EarnRoom AI` only for AI-specific surfaces.
   - Preserve the existing UK-wide positioning and remove any remaining obsolete pilot language.

4. **Repository-wide brand cleanup**
   - Audit source, prompts, emails, notifications, legal/policy content, seed/system copy, tests, documentation, and assets.
   - Remove the reversible `PREVIOUS_BRAND` block because this is the final migration.
   - Preserve immutable historical migration text where changing history would be unsafe; verify current live replacement migrations already supersede it.
   - Do not touch user-generated content, frozen Phase 7B logic, planner algorithms, AI behaviour, booking, auth, or payments.

5. **Verification and report**
   - Run focused brand tests, the full test suite, typecheck, production build, and configured lint.
   - Perform responsive visual QA on representative public, auth, authenticated, legal, search, listing, planner, and error surfaces without location-by-location testing.
   - Run a final case-insensitive legacy-string audit and classify every permitted historical occurrence.
   - Report counts, changed files, asset coverage, validation results, and any remaining historical references.

## Technical details

- The supplied PNG is 1774×887 and has an opaque white background. Asset derivatives will use lossless cropping/resizing only—no generated or traced redesign.
- The existing social card still visibly says Spacilo and will be replaced.
- Current `public/favicon.svg` / `EarnRoomMark.tsx` geometry differs from the approved icon and will no longer be the production source of truth.
- Historical SQL migrations remain immutable; current production data is governed by the later EarnRoom migration.
