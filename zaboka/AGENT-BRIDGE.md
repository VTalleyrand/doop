# Design agent routing

The local product policy (`hostedProducts = false`) keeps Doop's own agent
design (the Agents tab, its composer, chat, Recent tasks and working badges) and
plugs Zaboka in behind it: the composer sends through `designRunner.ts` to
Zaboka's Design agent, and each Design turn becomes one of Doop's own agent tasks
(`designTask`, `useAgentTasks`), so Doop's chat draws it as it draws its own
agents. While Design works, the send button is Stop. Hosted behavior is unchanged. Connect AI and onboarding connection prompts were already
suppressed by this policy.

## Contract evidence

Read the adjacent Zaboka checkout's electron/design-guest-preload.cjs,
electron/design-guest.mjs, packages/zaboka-design/server/turns.ts,
server/design-guest-replies.ts, server/app/design-host.ts and documentation.html
Design section. These include merged run ff7c444d (merge 550685cd27).
The bridge is version 1: submitPrompt, subscribe and cancel. Snapshots replace
request-local messages, including growing text and tool/job state.

## Decisions

- Use the existing local product policy, not Mac user-agent detection. This fork
  is local Design; a plain browser gets a clear missing-host error, never a Doop
  provider fallback. Hosted mode retains upstream behavior.
- Route at the browser composer, not server/agentRunners.ts. That endpoint lists
  server model accounts and has no Electron surface authority. No fake server
  provider or credentials are introduced. The picker names only Zaboka Design.
- Preserve attachment uploads and selection context; send their IDs as data with
  the prompt. Canvas edits use the host's existing design_tools MCP adapter,
  whose current-project and frame-membership checks remain authoritative.
- Keep turns in page memory while tabs switch, with one active local turn per
  project. Host conversation remains durable; reopening/reloading does not replay
  or recover local observations. Navigation releases subscriptions without
  claiming to stop host work. Cancel waits for the host's final snapshot.
- Keep existing chat, task history, panels and canvas tools: Design's turns are
  drawn by Doop's own AgentChat and Recent tasks, not a view of their own.

## Verification and limits

`bun run typecheck`, targeted Vitest tests (designRunner, agentChat, designPolicy;
33 tests), and `bun run build` passed. Build reports existing large chunk and
MuPDF browser externalization warnings. Transport tests inject a fake bridge;
they prove adapter behavior, not a running Design agent or actual MCP edits.
No live workspace data, host configuration or credentials were read or changed.
No embedded browser-control tool was exposed for this session. Follow-up: lead
should exercise an accepted turn from the Agents composer, verify an actual
current-canvas edit and Stop, and repeat from the canvas prompt entry point in
the embedded runtime. Verify session-memory history behavior is acceptable.
