import { describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest } from './browser'
import { canvasFrame, openCanvasPage } from './canvasPageFixture'

describe.skipIf(!findBrowserPath())('local Design canvas', () => {
  const pages = pagePerTest()
  it('keeps the editor while suppressing share and installer query prompts', async () => {
    const page = await pages.open()
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
  })
})
