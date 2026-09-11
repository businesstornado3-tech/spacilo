# Finish Meta diagnostics and Marketing Studio production readiness

## What the production evidence already proves

- YouTube and YouTube Shorts have genuine platform IDs and published URLs. Their code path will remain unchanged.
- Instagram OAuth is connected to `@businesstornado3`, with the expected professional account ID, encrypted Instagram-user token, required publishing permission, and a future expiry. The latest request was refused before a media container was created: `PERMISSION_DENIED: API access blocked`.
- Facebook is connected to the selected EarnRoom Page with an encrypted Page token and the expected Page permissions. Its latest request was refused by Meta before video acceptance: `Cannot call API for app … on behalf of user …`.
- Both failures point to application/token access at Meta, not missing video rendering. Previous real Meta confirmation IDs prove the upload adapters have worked before.
- No Computer or Free Cloud worker is currently registered, so neither may be shown as connected.
- Gmail is not connected to this project yet.

## Implementation

1. **Add one Founder-only Meta diagnostic service**
   - Reuse the existing encrypted tokens and official Meta/Instagram APIs.
   - Perform read-only checks for token validity/expiry, granted permissions, connected identity, account type, selected Page, Page tasks, Page-to-Instagram relationship, configured app IDs, API host/version, and app/token compatibility.
   - Record the exact safe Meta status, code, subcode, stage, timestamp, and attempt reference without storing tokens, secrets, signed media URLs, or raw sensitive payloads.
   - Classify the outcome as ready, reconnect required, Meta approval/access required, or external Meta block.

2. **Preserve publishing while improving stage evidence**
   - Keep the existing Facebook Page `/videos` flow and direct Instagram Login Reel flow.
   - Attach the publishing stage (`container creation`, `processing`, or `media_publish`) plus safe Meta code/subcode to failures.
   - Never retry automatically and never mark success without Meta’s final video/media ID.
   - Do not alter YouTube or YouTube Shorts files or behavior.

3. **Make the Studio status precise**
   - Keep connection and publishing as separate lines.
   - Add a Founder-only Instagram/Facebook diagnostic checklist and last-attempt reference.
   - Show **Reconnect Instagram/Facebook** only when diagnostics prove token/scope/authorization remediation is appropriate.
   - Show **Meta approval/access required** when reconnecting cannot resolve an app-level block; remove “Try again” for non-retryable Meta blocks.
   - Preserve campaign approval, validation reasons, manual publishing, and real platform links.

4. **Verify the existing safeguards remain intact**
   - Confirm autonomous limits count only confirmed autonomous publications and never restrict generation, manual approval, or manual publishing.
   - Confirm Paid Cloud remains £1.20/£2.40 with one explicit confirmation and no daily generation cap.
   - Confirm creative-history variety remains selected before generation.
   - Confirm all seven platform cards keep honest connection/readiness/publication states.

5. **Repair worker truth narrowly**
   - Add safe pairing/heartbeat diagnostics that expose the exact HTTP stage/status to the Founder without exposing credentials.
   - Keep Computer and Free Cloud disconnected until an authenticated heartbeat is stored.
   - Reuse the existing real setup package flow; do not create a worker release unless runtime evidence proves a worker-code change is necessary.

6. **Connect Gmail through official OAuth**
   - Link the Gmail connector for the named mailbox, requesting only the scopes needed for the implemented outreach workflow.
   - Keep sending permission-, consent-, source-, relevance-, and anti-spam-gated; store real Gmail message IDs/results only after confirmation.
   - If the Gmail connection is not completed, leave outreach explicitly unavailable rather than simulating it.

7. **Validation without side effects**
   - Add focused tests for Meta diagnostics/classification, stale-token reconnect decisions, stage-specific failures, status separation, confirmation-ID rules, worker heartbeat truth, autonomous-only counting, unlimited manual generation, and creative variety.
   - Run type checks, focused tests, lint, and inspect the authenticated Founder Console.
   - Make no paid generation, provider-generation call, social publication, OAuth reset, or credit spend.

## External limitation handling

Code can identify an app-level Meta restriction but cannot grant Meta App Review or Advanced Access. If diagnostics confirm that restriction, the Studio will state the exact required Meta Developer action and will not claim the issue was fixed in EarnRoom.
