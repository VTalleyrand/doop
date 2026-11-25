import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { BrandMark, type Brand } from '../src/components/ui/brand-mark'
import { chooseDesignModel, loadDesignModels, useDesignModels, type DesignEngine } from './designRunner'
import './modelPicker.css'

/*
 * The Design agent's model, picked the way Zaboka picks every agent's model
 * (Zaboka's src/components/ModelPicker.tsx): a quiet button with the
 * engine's mark and the model's name; it opens a frosted panel with a search
 * box across the top, the engines as a rail of marks on the left and that
 * engine's models on the right, the one in use lit. A search looks through
 * every engine. Engines that aren't ready stay visible, dimmed, with their
 * reason. The list and the pick come from Zaboka over the Design bridge
 * (designRunner.ts); a pick is the Design agent's own model, the same
 * setting as in Zaboka. Its look lives in modelPicker.css, Zaboka's values.
 */

/* Zaboka's engine kinds, as the marks Doop already draws */
const MARK: Partial<Record<string, Brand>> = {
  claudeAgent: 'claude',
  codex: 'openai',
  gemini: 'gemini',
  geminiCli: 'gemini',
  openrouter: 'openrouter',
  deepseek: 'deepseek',
  kimi: 'kimi',
  grok: 'grok',
  grokCli: 'grok',
  pi: 'pi',
  opencode: 'opencode',
  cursor: 'cursor',
}

function EngineMark({ kind, size }: { kind: string; size: number }) {
  const brand = MARK[kind]
  if (brand) return <BrandMark brand={brand} size={size} />
  return (
    <span className="zmp-letter" style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}>
      {kind.slice(0, 1).toUpperCase()}
    </span>
  )
}

const byReady = (a: DesignEngine, b: DesignEngine) => Number(b.ready) - Number(a.ready)
const labelOf = (engine: DesignEngine | undefined, model: string) =>
  engine?.models.find((m) => m.id === model)?.label ?? model

function Chevron() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="zmp-chevron"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="zmp-search-icon"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export function ZabokaModelPicker({ disabled = false }: { disabled?: boolean }) {
  const models = useDesignModels((s) => s.models)
  const error = useDesignModels((s) => s.error)
  const available = typeof window.zabokaDesign?.models === 'function'
  const [open, setOpen] = useState(false)
  const [railId, setRailId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (available) void loadDesignModels()
  }, [available])

  const engines = [...(models?.engines ?? [])].sort(byReady)
  const current = models?.current ?? null
  const active = current ? engines.find((e) => e.id === current.instanceId) : undefined
  const currentModel = current ? current.model || active?.default || '' : ''
  const rail = engines.find((e) => e.id === (railId ?? current?.instanceId)) ?? engines[0]

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w))
  const results = searching
    ? engines
        .map((engine) => ({ engine, found: engine.models.filter((m) => matches(`${m.label} ${m.id} ${engine.name}`)) }))
        .filter((group) => group.found.length > 0)
    : []

  // opening, or moving along the rail, starts at the model in use
  const railKey = rail?.id
  useEffect(() => {
    const list = listRef.current
    if (!open || !list) return
    const lit = list.querySelector<HTMLElement>('[aria-current="true"]')
    if (lit) lit.scrollIntoView({ block: 'nearest' })
    else list.scrollTop = 0
  }, [open, railKey, searching])

  if (!available) return null

  const pick = (engine: DesignEngine, model: string) => {
    if (!engine.ready) return
    void chooseDesignModel({ instanceId: engine.id, model })
    setOpen(false)
  }
  const takeFirst = () => {
    const first = searching
      ? results.find((g) => g.engine.ready)
      : rail?.ready
        ? { engine: rail, found: rail.models }
        : undefined
    const model = first?.found[0]
    if (first && model) pick(first.engine, model.id)
  }

  const row = (engine: DesignEngine, id: string, label: string): ReactNode => {
    const lit = current?.instanceId === engine.id && currentModel === id
    return (
      <button
        key={`${engine.id} ${id}`}
        type="button"
        aria-current={lit ? 'true' : undefined}
        disabled={!engine.ready}
        onClick={() => pick(engine, id)}
        title={
          engine.ready ? (label === id ? id : `${label}\n${id}`) : `${engine.name}: ${engine.reason ?? 'not ready'}`
        }
        className="zmp-row"
        data-lit={lit || undefined}
      >
        <span className="zmp-row-mark" data-off={!engine.ready || undefined}>
          <EngineMark kind={engine.kind} size={17} />
        </span>
        <span className="zmp-row-label">{label}</span>
        {id === engine.default && <span className="zmp-chip">default</span>}
      </button>
    )
  }

  const name = active ? labelOf(active, currentModel) || active.name : models ? 'Choose a model' : '…'

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setRailId(current?.instanceId ?? null)
          setQuery('')
          void loadDesignModels()
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="zmp-trigger"
          disabled={disabled || !models}
          aria-label={`Model: ${active ? `${active.name} · ${name}` : name}`}
          title={active ? `${active.name} · ${name}` : undefined}
        >
          {active && <EngineMark kind={active.kind} size={13} />}
          <span className="zmp-trigger-label">{name}</span>
          <Chevron />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Choose a model"
          className="zmp-panel"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>('input')?.focus()
          }}
          onEscapeKeyDown={(e) => {
            // the first Escape clears the search, the next one closes
            if (query) {
              e.preventDefault()
              setQuery('')
            }
          }}
        >
          <label className="zmp-search">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') takeFirst()
              }}
              placeholder="Search all models"
              aria-label="Search models"
            />
          </label>
          <div className="zmp-body">
            <div className="zmp-rail">
              {engines.map((engine) => (
                <button
                  key={engine.id}
                  type="button"
                  onClick={() => {
                    setRailId(engine.id)
                    setQuery('')
                  }}
                  title={engine.ready ? engine.name : `${engine.name}: ${engine.reason ?? 'not ready'}`}
                  aria-label={engine.name}
                  aria-pressed={!searching && engine.id === rail?.id}
                  className="zmp-rail-button"
                >
                  <span className="zmp-row-mark" data-off={!engine.ready || undefined}>
                    <EngineMark kind={engine.kind} size={19} />
                  </span>
                </button>
              ))}
            </div>
            <div ref={listRef} className="zmp-list">
              {searching ? (
                <>
                  {results.length === 0 && <div className="zmp-empty">No models match, in any engine.</div>}
                  {results.map(({ engine, found }) => (
                    <div key={engine.id} role="group" aria-label={engine.name} className="zmp-group">
                      <div className="zmp-group-name">{engine.name}</div>
                      {found.map((m) => row(engine, m.id, m.label))}
                    </div>
                  ))}
                </>
              ) : rail ? (
                <>
                  <div className="zmp-head">
                    <div className="zmp-head-line">
                      <span className="zmp-row-mark" data-off={!rail.ready || undefined}>
                        <EngineMark kind={rail.kind} size={18} />
                      </span>
                      <span className="zmp-head-name">{rail.name}</span>
                      <span
                        className="zmp-dot"
                        data-ready={rail.ready || undefined}
                        title={rail.ready ? 'Ready' : (rail.reason ?? 'Not ready')}
                        aria-label={rail.ready ? 'Ready' : 'Not ready'}
                      />
                    </div>
                    {!rail.ready && <p className="zmp-head-note">{rail.reason ?? 'Not ready'}</p>}
                  </div>
                  <div className="zmp-rule" />
                  {rail.models.length === 0 && <div className="zmp-empty">This engine lists no models.</div>}
                  {rail.models.map((m) => row(rail, m.id, m.label))}
                </>
              ) : (
                <div className="zmp-empty">{models ? 'No engines are set up in Zaboka.' : 'Asking Zaboka…'}</div>
              )}
              {error && <div className="zmp-empty">{error}</div>}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
