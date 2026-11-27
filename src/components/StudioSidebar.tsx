import { useEffect, useState } from 'react'
import { canEditOpenCanvas, useStore } from '../lib/store'
import { useOpenThreadCount } from '../lib/comments'
import { cn } from '@/lib/utils'
import { useT } from '../lib/i18n'
import { Panel, type PanelResize, PanelHeader, PanelTab, PanelTabPanel, PanelTabs, PanelTabsRoot } from './ui/panel'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { CheckIcon, MoreHorizontalIcon } from './ui/icons'
import { LayersPanel } from './LayersPanel'
import { CommentsPanel } from './CommentsPanel'
import { MemoryPanel } from './MemoryPanel'
import { ActivityList, AgentsChat } from './ActivityPanel'

type StudioTab = 'chat' | 'layers' | 'comments' | 'activity' | 'memory'

/** Which tab the studio sidebar shows, read off the store: the Layers face,
 *  else the Agents panel's tab (its "tasks" is the Chat tab here). Someone
 *  who cannot edit has Layers and Comments only. */
function useStudioTab(): StudioTab {
  return useStore((s) => {
    if (s.sidebarFace === 'layers') return 'layers'
    if (!canEditOpenCanvas(s)) return 'comments'
    return s.panelTab === 'tasks' ? 'chat' : s.panelTab
  })
}

function selectTab(tab: StudioTab) {
  const s = useStore.getState()
  if (tab === 'layers') s.setSidebarFace('layers')
  else s.setPanelTab(tab === 'chat' ? 'tasks' : tab)
}

/** The studio layout's left column: Chat, Layers and Comments as text tabs
 *  (Activity and Memory under More), one at a time, docked flush to the
 *  editor card's left edge. It takes the place of both the Layers panel and
 *  the Agents panel, which the other layouts show apart. */
export function StudioSidebar({
  canvasId,
  onAddFrame,
  resize,
}: {
  canvasId: string
  onAddFrame: () => void
  resize?: PanelResize
}) {
  const t = useT()
  const tab = useStudioTab()
  const canEdit = useStore(canEditOpenCanvas)
  const openThreads = useOpenThreadCount()
  const moreTab = tab === 'activity' || tab === 'memory' ? tab : null

  return (
    <Panel surface="docked" resize={resize} className="left-0 w-[264px] border-r">
      <PanelTabsRoot value={tab} onValueChange={(next) => selectTab(next as StudioTab)}>
        <PanelHeader className="h-10 gap-1 pr-1.5 pl-2">
          <PanelTabs aria-label={t('panels.studioTabsAria')}>
            {canEdit && <PanelTab value="chat">{t('panels.studioChat')}</PanelTab>}
            <PanelTab value="layers">{t('panels.layersTitle')}</PanelTab>
            <PanelTab value="comments">
              {t('panels.activityComments')}
              {openThreads > 0 && (
                <span className="font-mono text-caption font-normal text-ink-faint">
                  {openThreads > 99 ? '99+' : openThreads}
                </span>
              )}
            </PanelTab>
          </PanelTabs>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="bare"
                  size="icon-sm"
                  aria-label={t('panels.studioMore')}
                  title={
                    moreTab === 'activity'
                      ? t('panels.activityActivity')
                      : moreTab === 'memory'
                        ? t('panels.activityMemory')
                        : t('panels.studioMore')
                  }
                  className={cn(
                    'ml-auto size-7 shrink-0 rounded-row text-ink-faint hover:bg-paper-deep hover:text-ink data-[state=open]:bg-paper-deep',
                    moreTab && 'bg-paper-deep text-ink',
                  )}
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" width="sm">
                <DropdownMenuItem onSelect={() => selectTab('activity')}>
                  {t('panels.activityActivity')}
                  {tab === 'activity' && <CheckIcon className="ml-auto size-3.5" />}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => selectTab('memory')}>
                  {t('panels.activityMemory')}
                  {tab === 'memory' && <CheckIcon className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </PanelHeader>
        {canEdit && (
          <PanelTabPanel value="chat">
            <AgentsChat canvasId={canvasId} />
          </PanelTabPanel>
        )}
        <PanelTabPanel value="layers">
          <LayersPanel surface="embedded" onAddFrame={onAddFrame} />
        </PanelTabPanel>
        <PanelTabPanel value="comments">
          <CommentsPanel />
        </PanelTabPanel>
        <PanelTabPanel value="activity">
          <TickingActivity />
        </PanelTabPanel>
        <PanelTabPanel value="memory">
          <MemoryPanel />
        </PanelTabPanel>
      </PanelTabsRoot>
    </Panel>
  )
}

/** The activity feed, its relative times refreshed while it shows. */
function TickingActivity() {
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 5000)
    return () => window.clearInterval(timer)
  }, [])
  return <ActivityList />
}
