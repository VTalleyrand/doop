# Doop for Zaboka

This fork runs Doop on Zaboka's Mac mini, where the owner and Zaboka's agents design on it. Everything
specific to that lives in this folder and in `zaboka-coding.json`; the rest of the repository is Doop as
upstream ships it, so upstream updates merge cleanly. Keep it that way: change Doop itself where a
change is worth having, but prefer this folder for anything only Zaboka needs.

## How it runs

- **Doop** runs as a production build on `127.0.0.1:4400`, from its own checkout in
  `~/Library/Application Support/Doop/live`. Nobody edits that checkout; `deploy.mjs` moves it.
- **The door** (`door.mjs`) listens on `127.0.0.1:4410` and passes everything on to Doop signed in as
  the one local account, so there is no login. Calls to `/mcp` with no credentials get that account's
  agent key, so Zaboka's agents reach Doop's design tools without one.
- **Zaboka** shows Doop in its Design window (the `zaboka-design` package) and registers
  `http://127.0.0.1:4410/mcp` as an MCP server for its agents. Tailscale Serve may also put the door on
  the tailnet over HTTPS for a browser.

Kept outside the repository, in `~/Library/Application Support/Doop/` (never commit any of it):

| File            | What                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| `doop.env`      | Doop's settings and secrets (`BETTER_AUTH_SECRET`, encryption keys, ports) |
| `data/`         | Everything Doop saves: database (`pg`), uploads (`assets`)                 |
| `door/`         | `account.json` (the local account) and `agent-key`                         |
| `deployed.json` | What is live, and what was live before                                     |

Services: launchd `local.zaboka.doop` and `local.zaboka.doop-door` (written by `deploy.mjs`), logs in
`~/Library/Logs/doop/`.

## Changing Doop

Work on a branch as usual; Zaboka's Code runs merge into `zaboka`, and the owner merges to `main`.

- Check: `bun run typecheck && bun run test && bun run build` (`zaboka-coding.json`). The full suite
  takes about four minutes on the Mini.
- Deploy what `main` holds: `node zaboka/deploy.mjs` from a clean checkout. It builds in the live
  checkout, restarts both services and checks that the app opens signed in and the design tools answer;
  if not, it puts the previous commit back. `node zaboka/deploy.mjs --rollback` goes back one deploy.
- Run it locally while working: `bun run dev` (web on :4300, server on :4400). Stop the live service
  first if you need its port: `launchctl bootout gui/$(id -u)/local.zaboka.doop`, and deploy again after.

## Upstream

`upstream` is github.com/kgoedecke/doop. To take its updates:

    git fetch upstream && git merge upstream/main     # on a branch, then check, merge and deploy

Doop is AGPL-3.0: this fork stays public, which also covers the licence's source-sharing for anyone
using the Mini's copy. GitHub Actions are switched off on the fork: upstream's workflows build and
release upstream's own apps.

## First-time setup on a new machine

1. Install bun (`curl -fsSL https://bun.sh/install | bash`) and Node 22+.
2. Create `~/Library/Application Support/Doop/doop.env` (mode 600) with at least `NODE_ENV=production`,
   `HOST=127.0.0.1`, `PORT=4400`, `BETTER_AUTH_SECRET`, `SECRETS_ENCRYPTION_KEYS`, `BETTER_AUTH_URL` (the
   address people open it at), `TRUSTED_ORIGINS` (that address and `http://127.0.0.1:4410`),
   `REQUIRE_EMAIL_VERIFICATION=false` and `SIGNUP_EMAIL_DOMAINS=zaboka.local` (closes sign-up). See
   `.env.example`.
3. Deploy once, sign up the local account through Doop's API with an `@zaboka.local` address, save it as
   `door/account.json` (`{ "name", "email", "password" }`, mode 600), create an agent key for it and save
   it as `door/agent-key`, then deploy again.
