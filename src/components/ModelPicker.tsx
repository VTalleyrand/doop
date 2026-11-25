import { hostedProducts } from '../../zaboka/designPolicy'
import { Fragment, useEffect, useState } from 'react'
import { posthog } from '../lib/posthog'
import { navigate } from '../App'
import { cn } from '@/lib/utils'
import { BrandMark, type Brand } from './ui/brand-mark'
import { EffortSlider } from './ConnectionTable'
import { DoopMark } from './Logo'
import { useAgentModels } from './ModelAccount'
import { chooseDesignModel, loadDesignModels, useDesignModels } from '../../zaboka/designRunner'
import { useAgentRunners, useRunnerPick } from '../lib/runnerPick'
import { resolveRunnerPick, type AgentRunner, type RunnerOption, type RunnerProvider } from '../../shared/agentRunner'
import { useT, type PlainMessageKey } from '@/lib/i18n'
import {
  DropdownMenu,
  DropdownMenuCaption,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { MenuButton } from './ui/menu-button'

/* the brand mark each connection's models wear in the picker */
const PROVIDER_MARK: Partial<Record<RunnerProvider, Brand>> = {
  'claude-local': 'claude',
  'anthropic-key': 'claude',
  chatgpt: 'openai',
  'openai-key': 'openai',
  'gemini-key': 'gemini',
  'openrouter-key': 'openrouter',
  'deepseek-key': 'deepseek',
  'kimi-key': 'kimi',
  'kimi-code': 'kimi',
}

/* the effort ids stay as sent to the server; only their names are translated */
const EFFORT_NAMES: Record<string, PlainMessageKey> = {
  low: 'models.effortLow',
  medium: 'models.effortMedium',
  high: 'models.effortHigh',
  xhigh: 'models.effortXhigh',
  max: 'models.effortMax',
}
const EFFORT_BLURBS: Record<string, PlainMessageKey> = {
  low: 'models.effortLowBlurb',
  medium: 'models.effortMediumBlurb',
  high: 'models.effortHighBlurb',
  xhigh: 'models.effortXhighBlurb',
}
/* the Claude Plan's dial reads differently: it is the CLI's own levels */
const CLAUDE_EFFORT_BLURBS: Record<string, PlainMessageKey> = {
  low: 'models.claudeEffortLowBlurb',
  medium: 'models.claudeEffortMediumBlurb',
  high: 'models.claudeEffortHighBlurb',
  xhigh: 'models.claudeEffortXhighBlurb',
  max: 'models.claudeEffortMaxBlurb',
}

function modelName(models: RunnerOption[], id: string): string {
  return models.find((m) => m.id === id)?.name ?? id
}

/**
 * Where the next task goes: every connection the person has — the Claude
 * Plan on their desktop, their ChatGPT or API key — with its models, as a
 * quiet dropdown beside the composer's send button. The pick rides on the
 * card (this browser remembers it) and is independent of the Settings
 * default, which is what comments, @mentions and automations run on. With
 * nothing connected there is nothing to choose between, so it says so and
 * links to Settings.
 */
function HostedModelPicker({ disabled = false }: { disabled?: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const runners = useAgentRunners()
  const stored = useRunnerPick((s) => s.stored)
  const setPick = useRunnerPick((s) => s.setPick)
  const resolved = resolveRunnerPick(runners, stored)
  /* the picked account's live catalog, asked for once the menu opens; the
     other connections show their curated menus */
  const liveKind = resolved && resolved.runner.provider !== 'claude-local' ? resolved.runner.provider : undefined
  const catalog = useAgentModels(liveKind, open)
  const modelsOf = (runner: AgentRunner): RunnerOption[] =>
    runner.provider === liveKind && catalog?.live ? catalog.models : runner.models

  const label = resolved ? modelName(modelsOf(resolved.runner), resolved.pick.model ?? '') : 'Doop Agent'
  const mark = resolved ? PROVIDER_MARK[resolved.runner.provider] : undefined
  /* the effort reads after the model, lighter, as in Settings */
  const effortId = resolved?.pick.effort
  const effortKey = effortId ? EFFORT_NAMES[effortId] : undefined
  const effortLabel = effortId
    ? effortKey
      ? t(effortKey)
      : resolved?.runner.efforts?.find((e) => e.id === effortId)?.name
    : undefined

  function choose(runner: AgentRunner, model: string) {
    const effort = resolved?.runner.provider === runner.provider ? resolved.pick.effort : runner.effort
    setPick({ provider: runner.provider, model, ...(effort ? { effort } : {}) })
    posthog.capture('agent_runner_picked', { provider: runner.provider, model, via: 'composer' })
  }

  function chooseEffort(effort: string) {
    if (!resolved) return
    setPick({ ...resolved.pick, effort })
    posthog.capture('agent_effort_changed', { effort, provider: resolved.runner.provider, via: 'composer' })
  }

  const effortBlurbs = resolved?.runner.provider === 'claude-local' ? CLAUDE_EFFORT_BLURBS : EFFORT_BLURBS

  return (
    <DropdownMenu onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <MenuButton
          variant="quiet"
          disabled={disabled || !runners}
          aria-label={t('panels.modelAria', { label })}
          className={cn('min-w-0 shrink gap-[5px]')}
          icon={
            <span className="grid size-3 flex-none place-items-center">
              {mark ? (
                <BrandMark brand={mark} size={12} />
              ) : (
                /* no connection behind it: the agent's own mark */
                <DoopMark size={11} className="block" />
              )}
            </span>
          }
        >
          <span className="truncate">{label}</span>
          {/* on a phone the composer row has no room for it; the menu still shows and sets it */}
          {effortLabel && <span className="hidden flex-none text-ink-faint md:inline">{effortLabel}</span>}
        </MenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" width="auto">
        {runners && runners.runners.length > 0 ? (
          <>
            {runners.runners.map((runner) => (
              <Fragment key={runner.provider}>
                {/* one connection needs no name; several are told apart by theirs */}
                <DropdownMenuCaption>
                  {runners.runners.length > 1 ? runner.name : t('models.model')}
                </DropdownMenuCaption>
                <DropdownMenuRadioGroup
                  value={resolved?.runner.provider === runner.provider ? (resolved.pick.model ?? '') : ''}
                  onValueChange={(model) => choose(runner, model)}
                >
                  {modelsOf(runner).map((m) => (
                    <DropdownMenuRadioItem key={m.id} value={m.id} title={m.blurb}>
                      {m.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </Fragment>
            ))}
            {catalog?.error && liveKind && (
              <DropdownMenuCaption className="pb-2 text-ink-faint">{catalog.error}</DropdownMenuCaption>
            )}
            {resolved?.runner.efforts && (
              <>
                <DropdownMenuSeparator />
                <EffortSlider
                  efforts={resolved.runner.efforts.map((e) => {
                    const name = EFFORT_NAMES[e.id]
                    const blurb = effortBlurbs[e.id]
                    return {
                      id: e.id,
                      name: name ? t(name) : e.name,
                      blurb: blurb ? t(blurb) : t('models.effortServerDefault'),
                    }
                  })}
                  effort={resolved.pick.effort}
                  onEffort={chooseEffort}
                />
              </>
            )}
            <DropdownMenuSeparator />
          </>
        ) : (
          <DropdownMenuCaption className="pb-2 text-ink-soft">{t('panels.modelNoAccount')}</DropdownMenuCaption>
        )}
        <DropdownMenuItem onSelect={() => navigate('/settings?pane=agent')}>
          {runners && runners.runners.length > 0 ? t('panels.modelSettings') : t('panels.modelConnect')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* Zaboka's engines, by driver, as Doop's brand marks */
const ENGINE_MARK: Partial<Record<string, Brand>> = {
  claudeAgent: 'claude',
  codex: 'openai',
  gemini: 'gemini',
  geminiCli: 'gemini',
  openrouter: 'openrouter',
  deepseek: 'deepseek',
  kimi: 'kimi',
}

/**
 * In Zaboka Design the agent is Zaboka's Design agent, so the picker lists
 * the owner's Zaboka engines and their models, and a pick is that agent's
 * own model (the same setting as in Zaboka). Older Desktops without the
 * bridge's models() show nothing here.
 */
function DesignModelPicker({ disabled = false }: { disabled?: boolean }) {
  const t = useT()
  const models = useDesignModels((s) => s.models)
  const error = useDesignModels((s) => s.error)
  const available = typeof window.zabokaDesign?.models === 'function'
  useEffect(() => {
    if (available) void loadDesignModels()
  }, [available])
  if (!available) return null
  const current = models?.current ?? null
  const engines = models?.engines ?? []
  const engine = current ? engines.find((e) => e.id === current.instanceId) : undefined
  const modelId = current ? current.model || engine?.default || '' : ''
  const label = engine
    ? (engine.models.find((m) => m.id === modelId)?.label ?? (modelId || engine.name))
    : models
      ? 'Choose a model'
      : '…'
  const mark = engine ? ENGINE_MARK[engine.kind] : undefined

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void loadDesignModels()
      }}
    >
      <DropdownMenuTrigger asChild>
        <MenuButton
          variant="quiet"
          disabled={disabled || !models}
          aria-label={t('panels.modelAria', { label })}
          className={cn('min-w-0 shrink gap-[5px]')}
          icon={
            <span className="grid size-3 flex-none place-items-center">
              {mark ? <BrandMark brand={mark} size={12} /> : <DoopMark size={11} className="block" />}
            </span>
          }
        >
          <span className="truncate">{label}</span>
        </MenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" width="auto" className="max-h-[60vh] overflow-y-auto">
        {engines.map((e) => (
          <Fragment key={e.id}>
            <DropdownMenuCaption title={e.ready ? undefined : e.reason}>
              {engines.length > 1 ? e.name : t('models.model')}
              {!e.ready && <span className="text-ink-faint"> · not ready</span>}
            </DropdownMenuCaption>
            <DropdownMenuRadioGroup
              value={current?.instanceId === e.id ? modelId : ''}
              onValueChange={(model) => void chooseDesignModel({ instanceId: e.id, model })}
            >
              {e.models.map((m) => (
                <DropdownMenuRadioItem key={m.id} value={m.id} disabled={!e.ready}>
                  {m.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </Fragment>
        ))}
        {engines.length === 0 && (
          <DropdownMenuCaption className="pb-2 text-ink-soft">No engines are set up in Zaboka.</DropdownMenuCaption>
        )}
        {error && <DropdownMenuCaption className="pb-2 text-ink-faint">{error}</DropdownMenuCaption>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const ModelPicker = hostedProducts ? HostedModelPicker : DesignModelPicker
