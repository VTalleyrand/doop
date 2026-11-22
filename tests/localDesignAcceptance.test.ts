import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

// Test-only bootstrap: normal Better Auth signup, real HTTP/WS and isolated PGlite.
describe.skipIf(!findBrowserPath())('authenticated local Design acceptance', () => {
  const pages = pagePerTest()
  let web: BuiltServer
  let server: Server
  beforeAll(async () => {
    const port = await freePort()
    const dataDir = mkdtempSync(path.join(tmpdir(), 'doop-design-acceptance-'))
    cpSync(inject('browserRig')!.builtDir, path.join(dataDir, 'dist'), { recursive: true })
    server = await startServer(
      {
        PORT: String(port),
        BETTER_AUTH_URL: `http://localhost:${port}`,
        NODE_ENV: 'production',
        BETTER_AUTH_SECRET: 'disposable-acceptance-secret-at-least-32-characters',
        REQUIRE_EMAIL_VERIFICATION: 'false',
        SMTP_HOST: '',
        SIGNUP_EMAIL_DOMAINS: '',
        ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: '',
        HOST: '127.0.0.1',
      },
      dataDir,
    )
    web = { origin: server.base, close: async () => {} }
  }, 60_000)
  afterAll(async () => {
    await web?.close()
    server?.stop()
  })

  it('captures hidden entry points and retains persisted canvas editing', async () => {
    let page = await pages.open()
    page.setDefaultTimeout(10_000)
    await page.setViewport({ width: 1440, height: 1000 })
    const captureDir = process.env.DESIGN_CAPTURE_DIR
    if (captureDir) mkdirSync(captureDir, { recursive: true })
    const captures: string[] = []
    async function capture(name: string) {
      if (!captureDir) return
      await page.screenshot({ path: path.join(captureDir, `${name}.png`), fullPage: true })
      captures.push(name)
    }
    await page.goto(web.origin)
    const fixture = await page.evaluate(async () => {
      async function post(url: string, body: unknown) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`)
        return response.json()
      }
      await post('/api/auth/sign-up/email', {
        name: 'Synthetic Designer',
        email: 'acceptance@test.dev',
        password: 'synthetic-test-password123',
      })
      const workspace = await post('/api/workspaces', { name: 'Synthetic Project' })
      const canvas = await post('/api/canvases', { name: 'Acceptance document', workspaceId: workspace.id })
      await post(`/api/canvases/${canvas.id}/frames`, {
        name: 'Acceptance board',
        x: 0,
        y: 0,
        width: 600,
        height: 400,
        html: '<body style="background:#eee;padding:40px"><h1>Synthetic design</h1><button>Continue</button></body>',
      })
      return { canvasId: canvas.id, workspaceId: workspace.id }
    })
    const canvasUrl = `${web.origin}/c/${fixture.canvasId}`
    await page.goto(`${canvasUrl}?connect=1`)
    await page.waitForSelector('[data-page-id]')
    expect(await page.$$('[role="dialog"]')).toHaveLength(0)
    expect(
      await page.$$eval('button', (buttons) =>
        buttons.map((b) => b.textContent?.trim()).filter((t) => /^(Share|Connect AI)$/.test(t ?? '')),
      ),
    ).toEqual([])
    await capture('01-canvas-no-hosted-prompts')
    await page.click('button[aria-label="Main menu"]')
    const menu = await page.$eval('[role="menu"]', (el) => el.textContent ?? '')
    expect(menu).not.toMatch(/Upgrade|Customer support|Connect AI/)
    await capture('02-main-menu')
    await page.keyboard.press('Escape')
    await page.keyboard.down('Meta')
    await page.keyboard.press('k')
    await page.keyboard.up('Meta')
    await page.waitForSelector('input[placeholder="Search actions…"]')
    expect(await page.$eval('[role="dialog"]', (el) => el.textContent)).not.toMatch(/Upgrade|Customer support/)
    await capture('02b-command-palette')
    await page.keyboard.press('Escape')
    await page.setViewport({ width: 390, height: 844 })
    await capture('02c-mobile-canvas')
    await page.setViewport({ width: 1440, height: 1000 })
    await page.locator('button[aria-label="Add page"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-page-id]').length === 2)
    await page.reload()
    await page.waitForFunction(() => document.querySelectorAll('[data-page-id]').length === 2)
    await capture('03-persisted-page-edit')
    // Return to the board's page before presenting it.
    await page.click('[data-page-id]:first-child button')
    await page.click('button[aria-label="Present prototype"]')
    await capture('04-prototype')
    await page.keyboard.press('Escape')
    for (const [index, route] of [
      '/auth',
      '/admin',
      '/community',
      '/automations',
      '/integrations',
      '/oauth/consent',
      '/settings?pane=account',
      '/settings?pane=plan',
      '/settings?pane=webhooks',
      `/w/${fixture.workspaceId}?pane=members`,
      `/w/${fixture.workspaceId}?pane=billing`,
      '/install/codex',
    ].entries()) {
      const previous = page
      page = await previous.browserContext().newPage()
      await previous.close()
      await page.setViewport({ width: 1440, height: 1000 })
      console.info('Capturing route', route)
      await page.goto(web.origin + route, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('::-p-text(New canvas)')
      expect(await page.$('button[aria-label="Present prototype"]')).toBeNull()
      await capture(`hidden-${index}`)
    }
    for (const [index, route] of [
      '/settings?pane=appearance',
      '/settings?pane=fonts',
      `/w/${fixture.workspaceId}?pane=fonts`,
      `/w/${fixture.workspaceId}?pane=libraries`,
    ].entries()) {
      const previous = page
      page = await previous.browserContext().newPage()
      await previous.close()
      await page.setViewport({ width: 1440, height: 1000 })
      console.info('Capturing route', route)
      await page.goto(web.origin + route, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector(
        route.includes('libraries')
          ? '::-p-text(Component libraries)'
          : route.includes('appearance')
            ? '::-p-text(Appearance)'
            : '::-p-text(Fonts)',
      )
      expect(new URL(page.url()).pathname).toBe(new URL(web.origin + route).pathname)
      await capture(`retained-${index}`)
    }
    if (captureDir)
      writeFileSync(path.join(captureDir, 'captures.json'), JSON.stringify({ fixture, captures }, null, 2))
  }, 120_000)
})
