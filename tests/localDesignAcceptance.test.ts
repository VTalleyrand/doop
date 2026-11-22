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
    await server?.stopped
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
      const frame = await post(`/api/canvases/${canvas.id}/frames`, {
        name: 'Acceptance board',
        x: 0,
        y: 0,
        width: 600,
        height: 400,
        html: '<body style="background:#eee;padding:40px"><h1>Synthetic design</h1><button>Continue</button></body>',
      })
      return { canvasId: canvas.id, workspaceId: workspace.id, frameId: frame.id }
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
    await page.locator(`[data-row-key="${fixture.frameId}"]`).click({ button: 'right' })
    await page.waitForSelector('[role="menu"]')
    await page.locator('[role="menuitem"]::-p-text(Rename)').click()
    await page.waitForSelector(`[data-row-key="${fixture.frameId}"] input`)
    await page.type(`[data-row-key="${fixture.frameId}"] input`, 'Edited acceptance board')
    const renamed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/frames/${fixture.frameId}` &&
        response.request().method() === 'PATCH',
    )
    await page.keyboard.press('Enter')
    expect((await (await renamed).json()).name).toBe('Edited acceptance board')
    await page.reload()
    await page.waitForSelector(`[data-row-key="${fixture.frameId}"]`)
    expect(
      await page.evaluate(async ({ canvasId, frameId }) => {
        const canvas = await (await fetch(`/api/canvases/${canvasId}`)).json()
        return canvas.frames.find((frame: { id: string; name: string }) => frame.id === frameId).name
      }, fixture),
    ).toBe('Edited acceptance board')
    await page.locator(`[data-row-key="${fixture.frameId}"]`).click()
    await capture('03b-persisted-frame-edit')
    await page.click('button[aria-label="Present prototype"]')
    await capture('04-prototype')
    await page.keyboard.press('Escape')
    await page.locator('button[title="Export frames as a PDF"]').click()
    await page.waitForSelector('[role="group"][aria-label="Frames to export"]')
    await capture('05-export-dialog')
    // Observe the application's real response without issuing a second render.
    // CDP may discard a response body once the blob download consumes it.
    await page.evaluate(() => {
      const fetch = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        const response = await fetch(input, init)
        if (new URL(response.url).pathname.endsWith('/export.pdf')) {
          const bytes = await response.clone().arrayBuffer()
          document.body.dataset.exportPrefix = new TextDecoder().decode(bytes.slice(0, 5))
          document.body.dataset.exportBytes = String(bytes.byteLength)
        }
        return response
      }
    })
    const exported = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith('/export.pdf') && response.request().method() === 'GET',
    )
    await page.locator('button::-p-text(Download PDF)').click()
    const pdf = await exported
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    await page.waitForFunction(() => document.body.dataset.exportPrefix !== undefined)
    expect(await page.evaluate(() => document.body.dataset.exportPrefix)).toBe('%PDF-')
    expect(await page.evaluate(() => Number(document.body.dataset.exportBytes))).toBeGreaterThan(5)
    await page.waitForSelector('::-p-text(“Edited acceptance board.pdf” is ready)')
    await capture('06-export-completed')
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
