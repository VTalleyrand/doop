import { hostedProducts } from '../../zaboka/designPolicy'
import { useEffect } from 'react'
import { closeUpgrade, openUpgradeFromUrl, useUpgradeRequest } from '../lib/upgrade'
import { UpgradeModal } from './WorkspaceModals'

/** The one upgrade modal every "Upgrade" in the app opens (lib/upgrade),
 *  mounted once for a signed-in page. It also answers the `?upgrade` link. */
function HostedUpgradeHost() {
  const request = useUpgradeRequest()
  useEffect(openUpgradeFromUrl, [])
  if (!request) return null
  return <UpgradeModal reason={request.reason} onClose={closeUpgrade} />
}

export const UpgradeHost = () => (hostedProducts ? <HostedUpgradeHost /> : null)
