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

## Verification recovery (2026-11-22)

The earlier green recovery claim was not durable: the subsequent saved full check
(`/tmp/doop-recovery/full-check.log`, exit 1) failed Pages split: expected 105 to
be close to 120 at `tests/pagesSplitBrowser.test.ts:114`. Historical focused
passes must not be presented as full verification.

Unrelated editor test edits and the worker cap have been restored to integration
base `2e7636860960fdda9c80ec1014b11994f495c214`. In particular, the original
geometry undo assertions and history remain intact. No sleeps, retries, increased
timeouts or skips were introduced. Resource contention has not been measured well
enough to justify shipping a worker cap with this product policy.

Fresh evidence lives in `/tmp/doop-resume-evidence/`; its report records commands,
exit codes, baseline comparison and capture provenance. The isolated comparison
checkout is `/tmp/doop-resume-base`, at the unchanged integration base. Runs use
the same installed dependency tree, browser and original Vitest configuration,
sequentially on the same machine. Background host load is not experimentally
controlled; a failure recurring on both revisions establishes baseline presence,
not a timing diagnosis.

The direct inherited staged hook (`bunx lint-staged`) exited 0: oxlint, eslint
and Prettier all passed. There were no actual lint diagnostics. Historical failure
output is unavailable; no specific lint cause can honestly be claimed. Hooks are
retained. Zaboka CLI skill/check access returned “no credential in this environment,
so there is nobody to act as”; no credential recovery or live owner data was used.

Policy remains centralized in `zaboka/designPolicy.ts`. Upstream UI files contain
entry-point guards; server authorization and dormant hosted implementations remain
upstream. The final diff excludes editor behavior/test-runner repairs, reducing
future upstream conflicts. Route/menu/dialog entry points listed in README remain
the deliberate upstream merge review burden.

## Commit boundary audit (2026-11-22)

Decisions: retain the local policy and its acceptance tests; restore all five
inherited editor/configuration edits to unchanged base `2e7636860960fdda9c80ec1014b11994f495c214`.
The rich-text slice dropped earlier saves from the count and therefore weakened
the base assertion. Locator/poll substitutions and an unmeasured worker cap are
not needed to establish this UI policy. No retry, skip, timeout increase, or hook
bypass is included. Geometry and undo assertions match the base.

Exact historical hook diagnosis: `/tmp/doop-resume-evidence/commit.log` shows
Prettier and lint-staged cleanup passing, followed by commitlint `subject-empty`
and `type-empty`, then `husky - commit-msg script failed (code 1)`. The message
lacked a conventional type prefix. A normal instrumented commit with `test:`
passed in 1.51 seconds, exit 0; complete separate streams and exit metadata are
in `/tmp/doop-hook-diagnosis/`. There is no captured evidence of a formatter,
resource, or timeout failure. This explains the saved commit failure only; other
historical runner failures remain unclassified.

Base test review: accountMenu and appMenu expectations change because hosted
links and upgrades are deliberately absent. Five dormant hosted suites
(chatgptConnection, codexInstall, connectModal, librarySection, upgradeModal) retain their original behavioral
assertions by enabling the hosted policy only in test mocks. New designPolicy,
localDesignBrowser and localDesignAcceptance tests cover the default policy,
menus, initial URLs, authenticated persistence and retained tools. The baseline
full log records 23 skips before these additions; no new skip was added to an
existing suite. Acceptance uses the repository's existing browser availability
condition and requires Chromium to execute.

Runner access in this resumed environment returns exactly:
`no credential in this environment, so there is nobody to act as`.
Bounded setup fix: resume the run through Zaboka with its normal turn-scoped CLI
credential injected, then request the configured check and revision-bound UI
runner scenario. Do not copy owner credentials or fabricate a recorded pass.
Local captures are preparatory artifacts and cannot replace runner review.

## Controlled drawing completion and export evidence

The delayed-hit regression test now intercepts before the iframe runtime starts
and releases the request explicitly after pointer release/cancellation. It also
holds source cleanup after destination creation. Frame count is an intermediate
state, so the test waits for the source store update before checking the original
negative HTML and destination geometry assertions. The same held-cleanup experiment
reproduced the count-only assertion failure on integration `2e76368` and the task
revision, with two workers; corrected delayed-hit cases passed on both.

Authenticated acceptance now also renames a frame through the Layers tree, checks
persistence after reload, opens PDF export, and verifies the real export response
starts with `%PDF-`. Representative additional captures are
`03b-persisted-frame-edit.png`, `05-export-dialog.png`, and
`06-export-completed.png`. Capture hashes and check exit codes are recorded outside
the repository against the final checked commit. These captures still use the
isolated production web UI, not the native Design shell or its live data.

The PDF assertion observes a clone of the application's real fetch response.
CDP reported an empty body for the consumed download, while the browser clone
contained the PDF bytes and the application displayed its ready notice. This
test-only observation sends no extra export request and does not mock the server.
The native OS save dialog and a file saved to disk remain outside this capture.
