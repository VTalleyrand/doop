/** Local Design product boundary. Keep upstream subsystems available to the local door. */
export const hostedProducts = false
export function designSettingsPaneAllowed(pane: string): boolean {
  return !['account', 'plan', 'webhooks'].includes(pane)
}
export function designWorkspacePaneAllowed(pane: string): boolean {
  return ['fonts', 'libraries'].includes(pane)
}
export function designRouteAllowed(value: string): boolean {
  const url = new URL(value, 'http://design.local')
  const path = url.pathname
  if (path === '/' || /^\/c\/[^/]+(?:\/proto)?\/?$/.test(path)) return true
  if (path === '/settings') return designSettingsPaneAllowed(url.searchParams.get('pane') ?? '')
  if (/^\/w\/[^/]+\/?$/.test(path)) return designWorkspacePaneAllowed(url.searchParams.get('pane') ?? '')
  return false
}
export function designActionAllowed(id: string): boolean {
  return !['upgrade', 'customer-support'].includes(id)
}
