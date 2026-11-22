# Native AI boundary and Design host handoff

## Implemented Doop boundary

The local Design policy disables native AI with `nativeAI = false`. Settings
blocks agent/provider/custom-provider/local-connection and agent-key panes,
including direct routes. Home does not mount its native prompt composer. Canvas
Ask actions (palette and keyboard), chat, memory, suggestion toasts, resident
retry controls and limit wall are gated. Comments and activity stay available;
an old tasks/memory panel selection falls back to activity. Standalone
implementations remain intact behind the policy. Their native composer unit
tests explicitly enable nativeAI; local browser tests exercise the default.

MCP is independent: `server/mcp.ts` owns tools and `zaboka/door.mjs` forwards
`/mcp` with the local account's agent key. Neither is changed. Hiding key
management does not revoke the existing key.

## Prerequisite inspected read-only

The lead supplied this verified prerequisite status: the built-in Design agent
and dashboard connection are merged into Zaboka; automated checks passed; live
delegation, design creation and chat results remain for app acceptance. Prior
screenshots are unavailable. The task-context CLI is unavailable (`zaboka:
command not found`), so the lead authorized read-only inspection of the adjacent
Zaboka repository's `zaboka` branch. No Zaboka checkout, data, credentials or
backups were changed or read beyond source and Git metadata.

Source inspected at **cc5159d51561e3774a92b91dd0e196f4b2dd0bd6**:

- `packages/zaboka-design/ui/DesignDashboard.tsx`: dashboard reads Doop's
  `/api/canvases`; `DesignProject.id` is the **Doop canvas ID**, not its workspace
  ID and not a Zaboka workspace ID.
- `packages/zaboka-design/ui/DesignApp.tsx:66`: selected project opens
  `/c/${encodeURIComponent(project.id)}` via `desktop.browserCommand` with
  `tabId: 'design'` and endpoint `/api/design/browser`. Its host composer calls
  `currentProject: () => project?.id ?? null`.
- `packages/zaboka-design/ui/entry.tsx` supplies the production
  `submitDesignPrompt` helper to that composer.
- `packages/zaboka-design/ui/submit-design-prompt.ts`: existing public helper
  accepts **`{ prompt: string, projectId: string | null }`**, validates nonblank
  prompt (at most 100000 characters) and project ID (`^[\w-]{1,100}$`), then:
  1. `POST /api/design/agent` with **`{ projectId }`**, receiving
     **`{ botId, taskId }`**.
  2. Calls `host.openLane(botId, taskId)`.
  3. `POST /api/bots/${encodeURIComponent(botId)}/messages` with
     **`{ text: prompt, taskId }`**.
     It resolves with the receipt after message acceptance, not turn completion;
     request errors propagate. This helper does not itself deduplicate retries.
- `packages/zaboka-design/server/workspace.ts` handles `/agent` for the owner.
  `server/agent.ts` persists one lane per canvas ID; null selects `studio`.
  `server/tools.ts` restricts `canvas_id` to that lane's project and checks
  frame membership against the current canvas. The new-project studio lane can
  access only canvases it creates.
- `DesignApp.tsx:35-37,109` selects the receipt's bot and renders
  `host.chatPanels(submittedConversation)` in `FullScreenTool`.
  `src/extensions/registry.tsx` provides `openLane` and `chatPanels`;
  `src/components/FullScreenChat.tsx` connects ordinary floating/docked chat;
  `DockedChat.tsx` renders `ChatView`. `server/app/routes/agents.ts:1036`
  handles the ordinary agent message endpoint. This is the existing turn/card
  path to reuse, not a new Doop board-card runtime.

## Confirmed missing boundary

**No guest-to-Design submission handler exists at the inspected revision.**
Doop is not an iframe of the host page. `electron/embedded-browser.mjs:136`
creates an isolated `WebContentsView` with sandbox and context isolation, no
preload, no Node integration and no guest IPC bridge. Its HTTP handler at line
86 forwards guest requests through the configured resource endpoint. The
package's `server/browser.ts` accepts only its configured Doop origin and passes
those requests upstream to Doop. Neither path dispatches a guest prompt to the
host helper. The normal Desktop preload's `browserCommand` is exposed to the
owning renderer, not the guest. `window.parent.postMessage` would not reach
`DesignApp`; fetching `/api/design/agent` from Doop would reach Doop's server.

The existing native Doop paths are `PromptBar.sendPrompt` → `api.addCard` and
`Home.promptCanvas` → create canvas → `api.addCard`. These remain disabled;
no guessed bridge, credential forwarding or native-AI fallback was added.
The canvas prompt replacement is **not implemented**. The host's own composer
already uses the verified helper, but that is not a canvas submission bridge.

## Companion change brief for a Zaboka developer

1. Add a narrowly scoped request/response capability from the top-level Design
   guest to its owning Design renderer. Likely files are
   `electron/embedded-browser.mjs`, a dedicated guest preload if needed,
   `electron/preload.cjs`, the corresponding Desktop types in
   `src/extensions/types.ts` and `src/types/bridge.d.ts`, the package SDK adapter
   in `src/extensions/registry.tsx`, and
   `packages/zaboka-design/ui/DesignApp.tsx`. Do not enable generic guest IPC,
   expose host credentials, or enable the capability on Coding preview tabs or
   frame HTML. The companion developer must define and test the wire contract;
   no guest message name or injected global is currently agreed or implemented.
2. Bind requests to the owning Design surface and configured Doop origin.
   Resolve/validate the active canvas from the actual top-level guest `/c/<id>`
   URL. Reject or synchronize a mismatch with `DesignApp.project.id`: in-Doop
   navigation can change the guest without changing the dashboard selection.
   Never accept a guest-supplied bot, lane or workspace as authority. Only the
   studio dashboard uses null; an open canvas uses its canvas ID.
3. Route the validated request through the existing helper with exactly
   `{ prompt, projectId }`. Reuse the existing receipt handler that sets
   `submittedBot` and revision, so accepted turns appear through `chatPanels`.
   Preserve the existing `/api/design/agent` plus bot-message sequence.
4. Publish the guest capability name/version, payload, correlation and
   success/error/disposal behavior for the Doop developer. Acknowledge only
   after message acceptance, return `{ botId, taskId }`, prevent duplicate
   in-flight sends, and specify uncertain/lost-ack retry behavior. Doop can then
   restore a canvas composer that disables sends while pending, clears drafts
   only on success, and retains text with an inline error on failure.
5. Add host fixtures covering correct canvas mapping, in-guest project changes,
   wrong origin/tab/subframe rejection, duplicate sends, request errors and
   surface disposal. Verify the production helper and receipt-to-chat-panel
   connection without a paid model call. Coordinate the Doop capability change
   with that merged host contract; keep the current native-AI gates.

## Verification and limits

For the Doop code at `a8233e4`, `bun run typecheck`, `bun run build` and commit
hooks passed. Full `bun run test`: 391 passing files, one skipped, 3685 passing
tests and 23 skipped. Production build emitted its bundle-size warning. Focused
authenticated acceptance exercised blocked agent/key routes, hidden home prompt,
retained settings, real canvas editing/persistence and PDF export. Canvas fixture
coverage exercised absent native tabs/composer and Ask shortcut/palette. Existing
MCP suites exercised synthetic server tool contracts and request paths. The
first focused canvas assertion needed an explicit desktop viewport; the final
full pass includes that correction. No new skips or runner changes were added.

After read-only prerequisite discovery, a disposable local fixture bundled the
**exact merged** `submit-design-prompt.ts` source using a fake host. It passed
three project mappings (null, canvas-a, canvas-b), three validation cases, both
HTTP-request failures and a malformed receipt. It asserted exact endpoint,
project/prompt/lane payloads and `openLane` order. No network request, credentials
or agent execution was involved. The script is in `$TMPDIR/doop-design-contract-check.mjs`.
This is production-helper evidence, not a live turn or chat rendering check.

The full suite was not repeated for this documentation-only follow-up. The live
door, native Design window, guest-to-host submission, duplicate/failure draft
behavior and real agent results in chat cards remain outside executed coverage.
The supplied orientation and engineering skills were used; the additional
clean-code:typescript skill named by CLAUDE.md is not installed.
