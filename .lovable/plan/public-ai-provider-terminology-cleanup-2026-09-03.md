# Public AI provider terminology cleanup

## Scope
- Update the two confirmed visitor-visible disclosures in the privacy page and AI disclaimer.
- Replace named provider/platform wording with an accurate statement that selected images are sent to a third-party AI service only when a user requests AI processing.
- Preserve the existing disclosures about estimates, photo handling, analytics exclusion, advertising, storage, retention, and pending legal review.

## Boundaries
- Do not alter AI endpoints, models, prompts, provider configuration, response contracts, or error handling.
- Do not alter SpacePlanner, marketplace, authentication, analytics, founder/admin intelligence, campaign intelligence, or geographic demand functionality.
- Leave internal comments, implementation identifiers, infrastructure allowlists, and server-only configuration untouched because they are not public-facing copy and may be operationally required.

## Verification
- Re-scan public routes, components, content, metadata, tooltips, errors, and loading states for Gemini, Google AI, Lovable, and model/provider names.
- Run the complete existing test suite, TypeScript checks, production build, and browser checks for `/privacy` and `/legal/ai-disclaimer`, including console errors.
- Report the exact public-facing files changed and final test result.
