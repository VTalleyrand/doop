import type { ReactNode } from 'react'
import { canvasPages } from '../../shared/pages'
import { canEditOpenCanvas, useStore } from '../lib/store'
import { useT } from '../lib/i18n'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCaption,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ChevronDownIcon, GearIcon, SlidersIcon, XIcon } from './ui/icons'
import { barPillIconBtn } from './TopBar'
import { PresenceFace } from './PeerAvatars'
import { navigate } from '../App'
import { designSettingsPath } from '../../zaboka/designPolicy'
import { cn } from '@/lib/utils'

/** The studio layout's right column: a header strip carrying the zoom menu
 *  (portalled into `zoomSlot`), the way back to the chat and a close, over
 *  whichever properties panel has the slot (frame, element or page). */
export function StudioProperties({
  zoomSlot,
  onBackToChat,
  onClose,
  children,
}: {
  zoomSlot: (el: HTMLDivElement | null) => void
  onBackToChat: () => void
  onClose: () => void
  children: ReactNode
}) {
  const t = useT()
  const canEdit = useStore(canEditOpenCanvas)
  return (
    <aside className="pointer-events-auto absolute inset-y-0 right-0 z-[35] flex w-[244px] flex-col border-l border-line-soft bg-surface">
      <div className="flex h-10 flex-none items-center gap-1 border-b border-line-soft pr-1.5 pl-1.5">
        <div ref={zoomSlot} className="flex items-center" />
        <span className="flex-1" />
        {canEdit && (
          <Button
            variant="bare"
            className="h-7 rounded-row px-2 text-label font-normal text-ink-soft hover:bg-paper-deep hover:text-ink"
            onClick={onBackToChat}
          >
            {t('panels.studioBackToChat')}
          </Button>
        )}
        <Tooltip label={t('panels.studioHideProperties')} side="bottom" align="end">
          <Button
            variant="bare"
            size="icon-sm"
            className="size-7 shrink-0 rounded-row text-ink-faint hover:bg-paper-deep hover:text-ink"
            aria-label={t('panels.studioHideProperties')}
            onClick={onClose}
          >
            <XIcon className="size-3.5" />
          </Button>
        </Tooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  )
}

/** The page the canvas shows, as a menu in the studio bar: every page, the
 *  open one checked. Adding, renaming and reordering stay in the Layers tab. */
export function StudioPageMenu() {
  const t = useT()
  const canvas = useStore((s) => s.canvas)
  const pages = canvas ? canvasPages(canvas) : []
  const activePageId = useStore((s) => s.activePageId)
  const active = pages.find((page) => page.id === activePageId) ?? pages[0]
  if (!active) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="bare"
          className="h-7 min-w-0 max-w-[180px] gap-1 rounded-row px-2 text-label font-normal text-ink-soft hover:bg-paper-deep hover:text-ink data-[state=open]:bg-paper-deep"
        >
          <span className="truncate">{active.name}</span>
          <ChevronDownIcon className="size-3 flex-none text-ink-faint" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width="md">
        <DropdownMenuCaption>{t('panels.studioPages')}</DropdownMenuCaption>
        <DropdownMenuRadioGroup value={active.id} onValueChange={(id) => useStore.getState().setActivePage(id)}>
          {pages.map((page) => (
            <DropdownMenuRadioItem key={page.id} value={page.id}>
              <span className="truncate">{page.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The studio bar's far end: the properties column's toggle, Settings and
 *  you (a click renames you), which the side rail holds in the other layouts. */
export function StudioBarEnd({
  guest,
  propertiesAvailable,
  propertiesShown,
  onToggleProperties,
  me,
  onRenameSelf,
}: {
  guest: boolean
  propertiesAvailable: boolean
  propertiesShown: boolean
  onToggleProperties: () => void
  me: { name: string; image?: string; color: string }
  onRenameSelf: () => void
}) {
  const t = useT()
  const propertiesLabel = propertiesShown ? t('panels.studioHideProperties') : t('panels.studioShowProperties')
  return (
    <div className="flex items-center gap-1">
      {propertiesAvailable && (
        <Tooltip label={propertiesLabel} side="bottom">
          <Button
            variant="bare"
            size="icon-sm"
            className={cn(barPillIconBtn, propertiesShown && 'bg-paper-deep text-ink')}
            aria-label={propertiesLabel}
            aria-pressed={propertiesShown}
            onClick={onToggleProperties}
          >
            <SlidersIcon className="size-3.5" />
          </Button>
        </Tooltip>
      )}
      {!guest && (
        <>
          <Tooltip label={t('shell.settings')} side="bottom">
            <Button
              variant="bare"
              size="icon-sm"
              className={barPillIconBtn}
              aria-label={t('shell.settings')}
              onClick={() => navigate(designSettingsPath())}
            >
              <GearIcon className="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip label={t('canvas.youAre', { name: me.name })} side="bottom" align="end">
            <Button
              variant="bare"
              size="icon-sm"
              className="ml-0.5 size-7 rounded-full"
              aria-label={t('canvas.changeDisplayName')}
              onClick={onRenameSelf}
            >
              <PresenceFace
                name={me.name}
                image={me.image}
                color={me.color}
                kind="user"
                size={24}
                className="text-micro shadow-none"
              />
            </Button>
          </Tooltip>
        </>
      )}
    </div>
  )
}
