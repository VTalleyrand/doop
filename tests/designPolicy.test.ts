import { describe, expect, it } from 'vitest'
import { designActionAllowed, designRouteAllowed, hostedProducts } from '../zaboka/designPolicy'

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
})
