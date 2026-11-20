#!/usr/bin/env node
// Deploys this checkout's commit as the live Doop on Zaboka's Mac mini (zaboka/README.md).
//
//   node zaboka/deploy.mjs               deploy the commit this checkout is at (it must be clean)
//   node zaboka/deploy.mjs --rollback    go back to the commit deployed before the current one
//
// The live copy is its own checkout in DOOP_HOME/live (never the checkout people and agents edit),
// so work in progress never reaches the running app. Its data, settings and the door's secrets live
// beside it in DOOP_HOME and survive every deploy and rollback. A deploy that fails its health check
// puts the previous commit back and says so.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = homedir()
const BASE = resolve(process.env.DOOP_HOME ?? join(HOME, 'Library/Application Support/Doop'))
const LIVE = join(BASE, 'live'),
  DATA = join(BASE, 'data'),
  ENV = join(BASE, 'doop.env'),
  SECRETS = join(BASE, 'door'),
  STATE = join(BASE, 'deployed.json')
const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOOR_PORT = 4410,
  LOGS = join(HOME, 'Library/Logs/doop')
const AGENTS = join(HOME, 'Library/LaunchAgents'),
  uid = process.getuid()
const rollback = process.argv.includes('--rollback')

const say = (words) => console.log(`doop deploy: ${words}`)
const fail = (words) => {
  console.error(`doop deploy: ${words}`)
  process.exit(1)
}
const git = (dir, ...args) =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const readState = () => {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    return {}
  }
}
const which = (...candidates) => candidates.find((file) => file && existsSync(file))
const node = which('/opt/homebrew/bin/node', '/usr/local/bin/node', process.execPath)
const bun = which(join(HOME, '.bun/bin/bun'), join(HOME, '.local/bin/bun'), '/opt/homebrew/bin/bun')
if (!bun) fail('bun is not installed (https://bun.sh); Doop builds with it.')
for (const [file, what] of [
  [ENV, "Doop's settings"],
  [join(SECRETS, 'account.json'), "the door's local account"],
])
  if (!existsSync(file)) fail(`${what} (${file}) is missing. First-time setup is in zaboka/README.md.`)

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: [dirname(bun), dirname(node), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':'),
    },
  })
  if (result.status !== 0)
    throw new Error(
      `${[cmd, ...args].map((a) => a.split('/').pop()).join(' ')} failed (${result.status ?? result.signal})`,
    )
}

// ---- launchd services: Doop (localhost:4400, its port is in doop.env) and the door (localhost:4410)
const plist = (label, args, cwd, env = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>WorkingDirectory</key><string>${cwd}</string>
  <key>ProgramArguments</key><array>${args.map((a) => `<string>${a}</string>`).join('')}</array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${dirname(node)}:/usr/local/bin:/usr/bin:/bin</string>${Object.entries(
    env,
  )
    .map(([k, v]) => `<key>${k}</key><string>${v}</string>`)
    .join('')}</dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${LOGS}/${label === 'local.zaboka.doop' ? 'server' : 'door'}.log</string>
  <key>StandardErrorPath</key><string>${LOGS}/${label === 'local.zaboka.doop' ? 'server' : 'door'}.log</string>
</dict></plist>
`
const SERVICES = [
  [
    'local.zaboka.doop',
    plist(
      'local.zaboka.doop',
      [node, join(LIVE, 'node_modules/tsx/dist/cli.mjs'), `--env-file=${ENV}`, 'server/index.ts'],
      LIVE,
    ),
  ],
  [
    'local.zaboka.doop-door',
    plist('local.zaboka.doop-door', [node, join(LIVE, 'zaboka/door.mjs')], LIVE, {
      DOOP_DOOR_SECRETS: SECRETS,
      DOOR_PORT: String(DOOR_PORT),
    }),
  ],
]
function restart() {
  mkdirSync(LOGS, { recursive: true })
  for (const [label, text] of SERVICES) {
    const file = join(AGENTS, `${label}.plist`)
    const same = existsSync(file) && readFileSync(file, 'utf8') === text
    if (!same) {
      spawnSync('launchctl', ['bootout', `gui/${uid}/${label}`], { stdio: 'ignore' })
      writeFileSync(file, text)
      run('launchctl', ['bootstrap', `gui/${uid}`, file])
    } else run('launchctl', ['kickstart', '-k', `gui/${uid}/${label}`])
  }
}

// ---- healthy: the door serves the app signed in, and the design tools answer
async function healthy() {
  const door = `http://127.0.0.1:${DOOR_PORT}`,
    until = Date.now() + 120_000
  let last = ''
  while (Date.now() < until) {
    try {
      const page = await fetch(`${door}/`)
      const session = await (await fetch(`${door}/api/auth/get-session`)).json().catch(() => null)
      const mcp = await fetch(`${door}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'doop-deploy', version: '1' },
          },
        }),
      })
      if (page.ok && session?.session && mcp.ok) return true
      last = `page ${page.status}, ${session?.session ? 'signed in' : 'not signed in'}, design tools ${mcp.status}`
    } catch (error) {
      last = error.cause?.code ?? error.message
    }
    await new Promise((done) => setTimeout(done, 3000))
  }
  say(`not healthy after two minutes (${last}); logs are in ${LOGS}`)
  return false
}

// ---- put a commit live
function checkout(sha) {
  if (!existsSync(join(LIVE, '.git'))) {
    mkdirSync(BASE, { recursive: true })
    git(BASE, 'clone', '--quiet', '--no-checkout', SOURCE, 'live')
  }
  git(LIVE, 'fetch', '--quiet', '--no-tags', SOURCE, sha)
  git(LIVE, 'checkout', '--quiet', '--force', '--detach', sha)
  // Doop keeps everything it saves under <its folder>/data (database, uploads): that is DATA, kept outside
  const link = join(LIVE, 'data')
  mkdirSync(DATA, { recursive: true })
  if (!existsSync(link) || !lstatSync(link).isSymbolicLink()) {
    if (existsSync(link)) renameSync(link, `${link}.moved-aside-${Date.now()}`)
    symlinkSync(DATA, link)
  }
  run(bun, ['install', '--frozen-lockfile'], LIVE)
  run(bun, ['run', 'build'], LIVE)
}

const state = readState()
let target
if (rollback) {
  if (!state.previous) fail('there is no earlier deploy to go back to.')
  target = state.previous
} else {
  if (git(SOURCE, 'status', '--porcelain', '--untracked-files=no'))
    fail('this checkout has uncommitted changes; commit them (or deploy from a clean checkout).')
  target = git(SOURCE, 'rev-parse', 'HEAD')
}
const current = existsSync(join(LIVE, '.git')) ? git(LIVE, 'rev-parse', 'HEAD') : null
say(
  `${rollback ? 'rolling back' : 'deploying'} ${target.slice(0, 9)}${current ? ` (live: ${current.slice(0, 9)})` : ' (first deploy)'}`,
)
try {
  checkout(target)
  restart()
  if (!(await healthy())) throw new Error('health check failed')
} catch (error) {
  say(`${error.message}.`)
  if (current && current !== target) {
    say(`putting ${current.slice(0, 9)} back`)
    try {
      checkout(current)
      restart()
    } catch (again) {
      fail(`and putting the previous commit back failed too: ${again.message}. Doop may be down; logs are in ${LOGS}.`)
    }
    fail(
      (await healthy())
        ? `${target.slice(0, 9)} was not deployed; ${current.slice(0, 9)} is live again.`
        : `the previous commit is back but not healthy either; logs are in ${LOGS}.`,
    )
  }
  fail(`${target.slice(0, 9)} is not running; logs are in ${LOGS}.`)
}
writeFileSync(
  STATE,
  JSON.stringify(
    {
      sha: target,
      at: new Date().toISOString(),
      previous: current && current !== target ? current : (state.previous ?? null),
    },
    null,
    1,
  ),
)
say(`live: ${target.slice(0, 9)} — ${git(LIVE, 'log', '-1', '--format=%s')}`)
