/** Local Design product boundary. Keep upstream subsystems available to the local door. */
export const hostedProducts = false

/** Settings that apply to design work. Doop's agent connections (provider
 *  keys, local Claude and Codex, agent keys), the account, plans and webhooks
 *  belong to hosted Doop: in Zaboka the Design agent and its model come from
 *  Zaboka. */
const SETTINGS_PANES = ['general', 'appearance', 'fonts']
export function designSettingsPaneAllowed(pane: string): boolean {
  return SETTINGS_PANES.includes(pane)
}
export function designWorkspacePaneAllowed(pane: string): boolean {
  return ['fonts', 'libraries'].includes(pane)
}
export function designRouteAllowed(value: string): boolean {
  const url = new URL(value, 'http://design.local')
  const path = url.pathname
  if (path === '/' || /^\/c\/[^/]+(?:\/proto)?\/?$/.test(path)) return true
  if (path === '/settings') {
    const pane = url.searchParams.get('pane')
    return !pane || designSettingsPaneAllowed(pane)
  }
  if (/^\/w\/[^/]+\/?$/.test(path)) return designWorkspacePaneAllowed(url.searchParams.get('pane') ?? '')
  return false
}

/** Commands that leave the project or reach hosted Doop. Projects are made,
 *  listed and opened on Zaboka's Design dashboard, so the canvas has no way
 *  back to Doop's own home, no new or duplicated canvas, and no hosted docs,
 *  support or plans. */
const HIDDEN_ACTIONS = ['upgrade', 'customer-support', 'docs', 'go-to-files', 'new-canvas', 'duplicate-canvas']
export function designActionAllowed(id: string): boolean {
  return hostedProducts || !HIDDEN_ACTIONS.includes(id)
}

/** Settings opened from a canvas comes back to that canvas, never to Doop's home. */
export function designSettingsPath(): string {
  if (hostedProducts) return '/settings'
  const here = location.pathname.replace(/\/$/, '')
  return /^\/c\/[A-Za-z0-9_-]+$/.test(here) ? `/settings?from=${encodeURIComponent(here)}` : '/settings'
}

/** Words that name Zaboka's Design agent instead of Doop's own (English;
 *  every language falls back to them in local Design). */
const DESIGN_MESSAGES: Record<string, string> = {
  'panels.activityNoTasks': 'No tasks yet. Ask Design below — what it works on shows up here.',
  'panels.activityEmpty': 'No activity yet. Add a frame, or ask Design.',
  'panels.promptAria': 'Ask Design',
  'panels.promptPlaceholder': 'Ask Design to design something…',
  'panels.promptSent': 'Design is on it — watch the canvas',
  'canvas.agents': 'Agents · ⌘/ to ask Design',
  'canvas.agentsWorking': 'Agents · {working} working · ⌘/ to ask Design',
}
export function designMessage(key: string): string | undefined {
  return hostedProducts ? undefined : DESIGN_MESSAGES[key]
}
