#!/usr/bin/env node
// The door in front of this Doop on Zaboka's Mac mini (zaboka/README.md).
// Doop always wants an account. The door signs in once as the one local account and adds that
// session to every request and WebSocket it passes on, so nobody who opens Doop through it sees a
// login. Calls to /mcp that bring no credentials get the same account's agent key, so Zaboka's
// agents reach Doop's design tools without one.
// It listens on localhost only. Whoever can reach it is that account: keep it off networks you don't own.
// Its secrets (account.json, agent-key) live outside the repository, in DOOP_DOOR_SECRETS.
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const secrets = process.env.DOOP_DOOR_SECRETS ?? join(homedir(), 'Library/Application Support/Doop/door')
const PORT = Number(process.env.DOOR_PORT ?? 4410),
  UPSTREAM = { host: '127.0.0.1', port: Number(process.env.DOOP_PORT ?? 4400) }
const ORIGIN = `http://127.0.0.1:${PORT}` // one of Doop's TRUSTED_ORIGINS
const account = JSON.parse(readFileSync(join(secrets, 'account.json'), 'utf8'))
const SESSION = /^(?:__Secure-|__Host-)?better-auth\./
// /mcp wants OAuth or an agent key; a call that brings neither gets the local account's key
// (agent-key, revocable in Doop under Settings -> Agent keys).
const agentKey = (() => {
  try {
    return readFileSync(join(secrets, 'agent-key'), 'utf8').trim()
  } catch {
    return ''
  }
})()
const forAgents = (url, headers) =>
  agentKey && /^\/mcp(?:[/?]|$)/.test(url ?? '') && !headers.authorization
    ? { ...headers, authorization: `Bearer ${agentKey}` }
    : headers
const log = (...words) => console.log(new Date().toISOString(), ...words)

// ---- the one session
let cookies = new Map(),
  checkedAt = 0,
  signing
const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
function keep(setCookies) {
  for (const line of setCookies ?? []) {
    const [pair] = line.split(';'),
      at = pair.indexOf('=')
    const name = pair.slice(0, at).trim(),
      value = pair.slice(at + 1).trim()
    if (!SESSION.test(name)) continue
    if (value && !/max-age=0\b/i.test(line)) cookies.set(name, value)
    else cookies.delete(name)
  }
}
async function signIn() {
  const answer = await fetch(`http://${UPSTREAM.host}:${UPSTREAM.port}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email: account.email, password: account.password }),
  })
  if (!answer.ok) throw new Error(`Doop refused the local account (${answer.status}).`)
  cookies = new Map()
  keep(answer.headers.getSetCookie())
  if (!cookies.size) throw new Error('Doop signed in without a session cookie.')
  checkedAt = Date.now()
  log('signed in as the local account')
}
async function signedIn() {
  if (cookies.size && Date.now() - checkedAt < 60_000) return
  return (signing ??= (async () => {
    try {
      if (cookies.size) {
        const answer = await fetch(`http://${UPSTREAM.host}:${UPSTREAM.port}/api/auth/get-session`, {
          headers: { cookie: cookieHeader() },
        })
        if (answer.ok && (await answer.json().catch(() => null))?.session) {
          keep(answer.headers.getSetCookie())
          checkedAt = Date.now()
          return
        }
      }
      await signIn()
    } finally {
      signing = undefined
    }
  })())
}
/** The visitor's own cookies, minus any session of theirs, plus the local account's. */
function withSession(headers) {
  const own = String(headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !SESSION.test(part.split('=')[0]))
  return { ...headers, cookie: [...own, cookieHeader()].join('; ') }
}

const server = createServer(async (req, res) => {
  try {
    // Sign out would end the session everyone shares: answer it here and leave the session alone.
    if (req.method === 'POST' && req.url?.startsWith('/api/auth/sign-out')) {
      req.resume()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"success":true}')
      return
    }
    await signedIn()
  } catch (error) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`Doop is not answering yet. ${error.message}`)
    return
  }
  const upstream = request(
    { ...UPSTREAM, method: req.method, path: req.url, headers: forAgents(req.url, withSession(req.headers)) },
    (answer) => {
      const headers = { ...answer.headers }
      if (headers['set-cookie']) {
        keep(headers['set-cookie'])
        // the visitor never holds the session: it stays here
        const others = headers['set-cookie'].filter((line) => !SESSION.test(line.split('=')[0].trim()))
        if (others.length) headers['set-cookie'] = others
        else delete headers['set-cookie']
      }
      res.writeHead(answer.statusCode ?? 502, headers)
      answer.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Doop is not answering.')
  })
  req.pipe(upstream)
})

server.on('upgrade', async (req, socket, head) => {
  try {
    await signedIn()
  } catch {
    socket.destroy()
    return
  }
  const upstream = connect(UPSTREAM.port, UPSTREAM.host, () => {
    const headers = withSession(req.headers)
    const lines = Object.entries(headers).flatMap(([name, value]) =>
      Array.isArray(value) ? value.map((one) => `${name}: ${one}`) : [`${name}: ${value}`],
    )
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`)
    if (head?.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  const end = () => {
    upstream.destroy()
    socket.destroy()
  }
  upstream.on('error', end)
  socket.on('error', end)
})

server.listen(PORT, '127.0.0.1', () =>
  log(`door open on http://127.0.0.1:${PORT} -> Doop on ${UPSTREAM.host}:${UPSTREAM.port}`),
)
signedIn().catch((error) => log('Doop is not up yet:', error.message))
