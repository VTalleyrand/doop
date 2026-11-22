# Disposable local Design acceptance

The authenticated UI acceptance in `tests/localDesignAcceptance.test.ts` uses the
existing browser and server harnesses. Run from the repository root:

```sh
bun run build
DESIGN_CAPTURE_DIR=/tmp/doop-design-acceptance bun run test tests/localDesignAcceptance.test.ts
```

The rig copies the branch's production app bundle built by the existing browser
rig and starts a production server on a free loopback
port, with a separate temporary PGlite database and a fresh browser context.
It establishes the session with the supported Better Auth email signup API using
synthetic credentials, then creates a synthetic workspace (project), canvas
(document), and frame over the normal APIs. UI and persistence requests are not
mocked. The server and temporary database are removed on teardown. Screenshots
are opt-in and remain in the requested capture directory.

Coverage includes the suppressed connect query prompt, main menu, command palette, mobile canvas, page creation
and persistence after reload, prototype presentation, blocked hosted routes, and
retained appearance, fonts, and workspace library routes. Each route uses a fresh tab in the same authenticated browser context to
avoid a reproducible Chromium navigation stall after several sequential loads.
Blocked initial URLs render Home; their address bar is retained by the current product policy.

Limitations: this tests the local production app directly, not the live door,
its account, or the native Design window. It does not exercise external services,
provider credentials, native OS menus, or multi-user collaboration. Chromium must
be installed; the test skips when the existing browser finder cannot locate it.
Email verification is disabled only in the disposable server's configuration;
no shipped authentication code or production bypass is added. No live services,
owner credentials, or production data are used. The fixture's button is static;
prototype capture verifies the player, not a multi-frame navigation flow.

Product source under acceptance: `b49d07b4b31db29f20cbb0471efc5de0e22b1f09`.
The added acceptance harness and this documentation are test-only changes atop
that commit. Re-run captures when product source changes.

## Validation results

On 2026-11-22, typecheck and production build passed. Authenticated acceptance
passed with 22 PNG captures and a fixture/capture manifest in
`/tmp/doop-design-final` (ephemeral local artifacts). Product source stayed at the
commit above throughout; only this test and documentation changed.

The full required suite completed with 387 passing files, three failing files,
and one skipped file (3,676 passing tests, three failures, 23 skipped). A focused
retry of the failing files passed `elementPanelBrowser` and `frameRasterZoom`;
`richTextBrowser` reproduced the unordered-list shortcut failure and also failed
the ordered-list shortcut (100 passing tests, two failing tests). These editor
runtime tests were not changed by this work. Full logs are available locally at
`/tmp/doop-design-test.log` and `/tmp/doop-design-retest.log`. The full suite is
not green; this acceptance result does not override those failures.

## Revision provenance

Final verification records belong in a separate artifact directory named for the
checked commit. Its `verification.json` records the full commit and tree IDs,
commands, exit codes, baseline revision, and SHA-256 hashes of all 22 PNGs.
`captures.json` retains the synthetic fixture IDs and ordered capture names.
The final delivery reports the exact artifact paths. Earlier logs above are
historical evidence, not retries that establish a green suite.

## Recovery decisions (2026-11-22)

The recovery keeps every assertion, retry count and timeout intact. Locator clicks
wait for actionable comment pins and visibility controls; polling the copied-node
count waits for the iframe DOM to catch up with the saved drawing. Rich-text setup
waits for its edit event rather than assuming a 500ms scheduling window. The original
count of **all** edit messages remains exactly one; filtering to list-only messages
was rejected because it could hide an extra save.

`zaboka/testPolicy.ts` caps Vitest at four workers to leave resources for Chromium
renderers and the fixture server on the shared Mini. Earlier unrestricted runs
showed browser timing failures; this limits contention without retrying tests or
changing their requirements. Clipboard tests retain their existing serialization.

The complete recovery command passed: 391 test files and 3,680 tests passed;
one file and 23 tests were skipped by existing conditions. Typecheck and build
passed. Earlier baseline list-shortcut failures are historical and did not recur
with the event-based setup wait and original assertions.

Both complete saved hook logs (`/tmp/doop-final-commit.log` and
`/tmp/doop-hook-diagnostic.log`) show Prettier and all other tasks succeeding.
They establish no failed-hook cause. A truncated progress display alone cannot
identify a Prettier failure. Recovery records the full normal commit output and
exit status without bypassing hooks. Fresh revision-bound checks and captures
are recorded under `/tmp/doop-recovery/` after committing.
