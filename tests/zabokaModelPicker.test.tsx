// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ZabokaModelPicker } from '../zaboka/ZabokaModelPicker'
import { useDesignModels, type DesignBridge, type DesignModels } from '../zaboka/designRunner'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const listed: DesignModels = {
  current: { instanceId: 'claude', model: '' },
  engines: [
    {
      id: 'codex',
      name: 'Codex',
      kind: 'codex',
      ready: false,
      reason: 'Signed out',
      default: 'gpt-5.5',
      models: [{ id: 'gpt-5.5', label: 'GPT-5.5' }],
    },
    {
      id: 'claude',
      name: 'Claude',
      kind: 'claudeAgent',
      ready: true,
      default: 'opus',
      models: [
        { id: 'opus', label: 'Opus 5.5' },
        { id: 'sonnet', label: 'Sonnet 5.5' },
      ],
    },
  ],
}
let root: Root
let container: HTMLDivElement
let setModel: ReturnType<typeof vi.fn>
beforeEach(() => {
  setModel = vi.fn(async (pick) => ({ ...listed, current: pick }))
  window.zabokaDesign = { version: 1, models: vi.fn(async () => listed), setModel } as unknown as DesignBridge
  useDesignModels.setState({ models: null, error: undefined })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete window.zabokaDesign
})

async function open() {
  await act(async () => root.render(<ZabokaModelPicker />))
  await act(async () => {})
  const trigger = container.querySelector<HTMLButtonElement>('button')!
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    trigger.click()
  })
  await act(async () => {})
  return trigger
}

it('names the model in use, the engine default when none is set, as Zaboka does', async () => {
  await act(async () => root.render(<ZabokaModelPicker />))
  await act(async () => {})
  const trigger = container.querySelector('button')!
  expect(trigger.textContent).toContain('Opus 5.5')
  expect(trigger.getAttribute('aria-label')).toBe('Model: Claude · Opus 5.5')
})

it('opens on the engine in use: a rail of engines, ready ones first, and its models with the one in use lit', async () => {
  await open()
  const panel = document.querySelector('[aria-label="Choose a model"]')!
  const rail = [...panel.querySelectorAll('.zmp-rail-button')].map((b) => b.getAttribute('aria-label'))
  expect(rail).toEqual(['Claude', 'Codex'])
  expect(panel.querySelector('.zmp-rail-button[aria-pressed=true]')?.getAttribute('aria-label')).toBe('Claude')
  expect(panel.querySelector('[aria-current=true]')?.textContent).toContain('Opus 5.5')
  expect(panel.querySelector('[aria-current=true]')?.textContent).toContain('default')
})

it('searches every engine and picks the Design agent\x27s own model', async () => {
  await open()
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search models"]')!
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, 'sonnet')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const rows = [...document.querySelectorAll<HTMLButtonElement>('.zmp-row')]
  expect(rows.map((r) => r.textContent)).toEqual(['Sonnet 5.5'])
  await act(async () => rows[0]!.click())
  expect(setModel).toHaveBeenCalledWith({ instanceId: 'claude', model: 'sonnet' })
})

it('keeps an engine that is not ready visible, with its reason, and never picks from it', async () => {
  await open()
  const codex = document.querySelector<HTMLButtonElement>('.zmp-rail-button[aria-label=Codex]')!
  await act(async () => codex.click())
  expect(document.querySelector('.zmp-head-note')?.textContent).toBe('Signed out')
  const row = document.querySelector<HTMLButtonElement>('.zmp-row')!
  expect(row.disabled).toBe(true)
  await act(async () => row.click())
  expect(setModel).not.toHaveBeenCalled()
})

it('shows nothing on a Zaboka Desktop without the picker bridge', async () => {
  delete window.zabokaDesign
  await act(async () => root.render(<ZabokaModelPicker />))
  expect(container.innerHTML).toBe('')
})
