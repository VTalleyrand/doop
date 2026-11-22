import { describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest } from './browser'
import { canvasFrame, openCanvasPage } from './canvasPageFixture'

describe.skipIf(!findBrowserPath())('local Design canvas', () => {
  const pages = pagePerTest()
  it('keeps the editor while suppressing share and installer query prompts', async () => {
    const page = await pages.open()
    await page.setViewport({ width: 1440, height: 1000 })
    await openCanvasPage(
      page,
      [canvasFrame({ id: 'board', name: 'Local board', x: 0, y: 0, width: 800, height: 600 })],
      '?connect=1',
    )
    expect(
      await page
        .locator('body')
        .map((el) => el.textContent)
        .wait(),
    ).toContain('Local board')
    expect(
      await page.$$eval('button', (buttons) =>
        buttons.map((b) => b.textContent?.trim()).filter((t) => /^(Share|Connect AI)$/.test(t ?? '')),
      ),
    ).toEqual([])
    expect(await page.$$('[role="dialog"]')).toHaveLength(0)
    const tabs = await page.$$eval('[role="tablist"][aria-label="Agents panel"] [role="tab"]', (items) =>
      items.map((item) => item.textContent?.trim()),
    )
    expect(tabs).toEqual(['Comments', 'Activity'])
    expect(await page.$('textarea')).toBeNull()
    await page.keyboard.down('Meta')
    await page.keyboard.press('/')
    await page.keyboard.up('Meta')
    expect(await page.$('textarea')).toBeNull()
    await page.keyboard.down('Meta')
    await page.keyboard.press('k')
    await page.keyboard.up('Meta')
    await page.waitForSelector('input[placeholder="Search actions…"]')
    expect(await page.$eval('[role="dialog"]', (el) => el.textContent)).not.toContain('Ask the agent')
  })
})
