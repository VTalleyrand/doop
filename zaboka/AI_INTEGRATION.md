# Native AI boundary and pending host integration

The local Design policy disables native AI with `nativeAI = false`. The Settings
page blocks agent/provider/custom-provider/local-connection and agent-key panes,
including direct routes. Home does not mount its native prompt composer. Canvas
Ask actions (palette and keyboard), chat, memory, suggestion toasts, resident
retry controls and limit wall are gated. Existing comments and activity stay
available; an old tasks/memory panel selection falls back to activity.
Standalone implementations remain intact behind the policy. Their native composer
unit tests explicitly enable nativeAI; local browser tests exercise the default.

MCP is independent: `server/mcp.ts` owns tools and `zaboka/door.mjs` forwards
`/mcp` with the local account's agent key. Neither is changed. Hiding key
management does not revoke the existing key.

## Pending prerequisite — not a completed replacement

Task context `d1a7e5e7-2026-4b21-9d01-000000000104` could not be retrieved:
`zaboka task context …` returns `command not found`. No Zaboka CLI/tool or
Design-window bridge implementation is exposed in this checkout. The supplied
codebase-orientation and software-engineering skills were used; the additional
clean-code:typescript skill named in CLAUDE.md is not installed.

No prerequisite Design studio contract was relied on or invented. The current
native submission paths are `PromptBar.sendPrompt` → `api.addCard` and
`Home.promptCanvas` → create canvas → `api.addCard`; these must not be used as a
fallback for Zaboka agent submissions. This partial change hides those composers
until the real host path can be wired. It does not send Design turns or prove
Zaboka chat-card delivery and is not ready as the complete task.

Follow-up needed from the lead: provide the merged `zaboka-design` host source
paths and contract, including browser bridge invocation, active Zaboka project
identity (not assumed to equal Doop workspace/canvas IDs), prompt payload,
acknowledgement/error semantics, and the existing agent-turn/chat-card path.
After that, add the canvas composer through that bridge with in-flight duplicate
protection, clear drafts only on acknowledgement, retain drafts on failure, and
verify its payload/error behavior against host fixtures. Exercise the existing
turn-to-chat-card path without paid calls if a host test harness is available.
Companion file changes cannot be specified accurately without that source.

## Verification of this partial change

`bun run typecheck` and `bun run build` passed. The full `bun run test` passed
391 files (one skipped), with 3,685 tests passed and 23 skipped. The production
build emitted its bundle-size warning. Focused authenticated acceptance exercised
blocked agent/key routes, the hidden home prompt, retained settings, real canvas
editing/persistence and PDF export. The canvas fixture exercised the absent
native tabs/composer and Ask shortcut/palette. Existing MCP suites exercised the
server tool contract and request paths using synthetic fixtures; the live door,
its credentials and the native Design window were not exercised.

The first focused canvas assertion used the fixture's mobile viewport, where the
panel is closed; it passed after explicitly selecting a desktop viewport. The
full run above includes that correction. No new skips or runner changes were
introduced. Prompt-to-host payload, duplicate sends, draft retention on host
failure and Zaboka chat-card delivery remain untested and unimplemented pending
the prerequisite contract.
