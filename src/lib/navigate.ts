import { designRouteAllowed } from '../../zaboka/designPolicy'
/** the SPA's one way to move: push the path and let App's popstate listener re-render */
export function navigate(path: string) {
  history.pushState(null, '', designRouteAllowed(path) ? path : '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}
