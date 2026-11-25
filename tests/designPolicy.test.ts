import { describe, expect, it } from 'vitest'
import {
  designActionAllowed,
  designMessage,
  designRouteAllowed,
  designSettingsPaneAllowed,
  hostedProducts,
} from '../zaboka/designPolicy'
import { translateIn } from '../src/lib/i18n'

describe('local Design entry points', () => {
  it.each([
    '/auth',
    '/admin',
    '/community',
    '/automations',
    '/automations/example',
    '/integrations',
    '/oauth/consent',
    '/settings?pane=account',
    '/settings?pane=plan',
    '/settings?pane=webhooks',
    '/settings?pane=agent',
    '/settings?pane=keys',
    '/w/team?pane=members',
    '/w/team?pane=billing',
    '/install/codex',
  ])('rejects %s', (route) => {
    expect(designRouteAllowed(route)).toBe(false)
  })
  it.each([
    '/',
    '/c/local',
    '/c/local?page=second',
    '/c/local/proto',
    '/settings',
    '/settings?pane=general',
    '/settings?pane=fonts',
    '/settings?pane=appearance',
    '/w/local?pane=libraries',
    '/w/local?pane=fonts',
  ])('retains %s', (route) => {
    expect(designRouteAllowed(route)).toBe(true)
  })
  it('keeps design commands and disables commercial commands', () => {
    expect(hostedProducts).toBe(false)
    for (const id of ['present', 'create-component', 'frame-selection', 'export', 'layers-panel'])
      expect(designActionAllowed(id)).toBe(true)
    expect(designActionAllowed('upgrade')).toBe(false)
    expect(designActionAllowed('customer-support')).toBe(false)
  })
  it('keeps the canvas in its project: no way to Doop home, new canvases or hosted docs', () => {
    for (const id of ['go-to-files', 'new-canvas', 'duplicate-canvas', 'docs'])
      expect(designActionAllowed(id)).toBe(false)
    for (const id of ['palette', 'ask-agent', 'agents-panel', 'import', 'export-pdf'])
      expect(designActionAllowed(id)).toBe(true)
  })
  it("leaves Doop's own agent connections out of Settings", () => {
    for (const pane of ['agent', 'keys', 'account', 'plan', 'webhooks'])
      expect(designSettingsPaneAllowed(pane)).toBe(false)
    for (const pane of ['general', 'appearance', 'fonts']) expect(designSettingsPaneAllowed(pane)).toBe(true)
  })
  it('names Zaboka’s Design agent where Doop names its own', () => {
    expect(designMessage('panels.promptAria')).toBe('Ask Design')
    expect(translateIn('en', 'panels.activityNoTasks')).not.toMatch(/Doop Agent|connect/)
    expect(translateIn('pt-BR', 'canvas.agents')).toBe('Agents · ⌘/ to ask Design')
    expect(designMessage('panels.chatDone')).toBeUndefined()
  })
})
