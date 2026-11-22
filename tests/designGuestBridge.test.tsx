// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Canvas } from '../shared/types'
import { useStore } from '../src/lib/store'
import { DesignPromptBar } from '../zaboka/DesignPromptBar'
import { sendDesignPrompt, type DesignPromptAck, type DesignPromptRequest } from '../zaboka/designBridge'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let canvasId: string
let root: Root | undefined
let container: HTMLDivElement | undefined
const accepted = (request: DesignPromptRequest): DesignPromptAck => ({
  requestId: request.requestId,
  status: 'accepted',
  botId: 'design-bot',
  taskId: 'design-lane',
})
const submitPrompt = vi.fn(async (request: DesignPromptRequest) => accepted(request))

beforeEach(() => {
  canvasId = crypto.randomUUID()
  useStore.setState({
    canvas: { id: canvasId, workspaceId: 'workspace-not-project', role: 'edit', frames: [] } as unknown as Canvas,
    composerSend: null,
    composerDrafts: { [canvasId]: '  Make a poster  ' },
  })
  submitPrompt.mockReset().mockImplementation(async (request) => accepted(request))
  window.zabokaDesign = { version: 1, submitPrompt }
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  container?.remove()
  root = undefined
  container = undefined
  delete window.zabokaDesign
})

it('sends the active canvas id, text and correlation id, clearing only after acceptance', async () => {
  await sendDesignPrompt(canvasId)
  const request = submitPrompt.mock.calls[0]![0]
  expect(request).toEqual({ projectId: canvasId, prompt: 'Make a poster', requestId: expect.any(String) })
  expect(request.requestId).toMatch(/^[\w-]+$/)
  expect(useStore.getState().composerDrafts[canvasId]).toBe('')
  expect(useStore.getState().composerSend?.status).toBe('sent')
})

it('locks duplicate submissions synchronously and keeps the draft until acknowledgement', async () => {
  let resolve!: (ack: DesignPromptAck) => void
  submitPrompt.mockImplementationOnce(() => new Promise((done) => (resolve = done)))
  const first = sendDesignPrompt(canvasId)
  await sendDesignPrompt(canvasId)
  expect(submitPrompt).toHaveBeenCalledTimes(1)
  expect(useStore.getState().composerSend?.status).toBe('busy')
  expect(useStore.getState().composerDrafts[canvasId]).toBe('  Make a poster  ')
  resolve(accepted(submitPrompt.mock.calls[0]![0]))
  await first
})

it('retains draft and correlation id on uncertain failure, allowing an explicit deduplicated retry', async () => {
  submitPrompt.mockRejectedValueOnce(Error('Connection lost; acceptance unknown.'))
  await sendDesignPrompt(canvasId)
  const first = submitPrompt.mock.calls[0]![0]
  expect(useStore.getState().composerDrafts[canvasId]).toBe('  Make a poster  ')
  expect(useStore.getState().composerSend).toMatchObject({
    status: 'error',
    message: 'Connection lost; acceptance unknown.',
  })
  await sendDesignPrompt(canvasId)
  expect(submitPrompt.mock.calls[1]![0]).toEqual(first)
  useStore.getState().setComposerDraft(canvasId, 'Make a poster')
  await sendDesignPrompt(canvasId)
  expect(submitPrompt.mock.calls[2]![0].requestId).not.toBe(first.requestId)
})

it('assigns a new id to an edited prompt after failure', async () => {
  submitPrompt.mockRejectedValueOnce(Error('Lost connection'))
  await sendDesignPrompt(canvasId)
  useStore.getState().setComposerDraft(canvasId, 'Make a flyer')
  await sendDesignPrompt(canvasId)
  expect(submitPrompt.mock.calls[1]![0].requestId).not.toBe(submitPrompt.mock.calls[0]![0].requestId)
  expect(submitPrompt.mock.calls[1]![0].prompt).toBe('Make a flyer')
})

it.each(['rejected', 'wrong-id', 'bad-receipt'] as const)('retains text for %s acknowledgements', async (mode) => {
  submitPrompt.mockImplementationOnce(async (request) =>
    mode === 'rejected'
      ? { requestId: request.requestId, status: 'rejected', message: 'Choose the current project.' }
      : {
          requestId: mode === 'wrong-id' ? 'other-request' : request.requestId,
          status: 'accepted',
          botId: '',
          taskId: '',
        },
  )
  await sendDesignPrompt(canvasId)
  expect(useStore.getState().composerDrafts[canvasId]).toBe('  Make a poster  ')
  expect(useStore.getState().composerSend?.status).toBe('error')
})

it('preserves a replacement draft while the accepted request is pending', async () => {
  submitPrompt.mockImplementationOnce(async (request) => {
    useStore.getState().setComposerDraft(canvasId, 'Next idea')
    return accepted(request)
  })
  await sendDesignPrompt(canvasId)
  expect(useStore.getState().composerDrafts[canvasId]).toBe('Next idea')
})

it.each(['different-canvas', 'readonly', 'too-long', 'missing-host'] as const)(
  'refuses %s without sending',
  async (mode) => {
    if (mode === 'different-canvas') useStore.setState({ canvas: null })
    if (mode === 'readonly') useStore.setState({ canvas: { ...useStore.getState().canvas!, role: 'view' } })
    if (mode === 'too-long') useStore.getState().setComposerDraft(canvasId, 'x'.repeat(100001))
    if (mode === 'missing-host') delete window.zabokaDesign
    await sendDesignPrompt(canvasId)
    expect(submitPrompt).not.toHaveBeenCalled()
    expect(useStore.getState().composerDrafts[canvasId]).toBeTruthy()
    expect(useStore.getState().composerSend?.status).toBe('error')
  },
)

async function render() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<DesignPromptBar canvasId={canvasId} />))
}

it('refuses an unsupported capability version without sending or mounting', async () => {
  Object.defineProperty(window.zabokaDesign!, 'version', { value: 2 })
  await sendDesignPrompt(canvasId)
  expect(submitPrompt).not.toHaveBeenCalled()
  await render()
  expect(container!.textContent).toBe('')
})

it('mounts no composer when the companion capability is absent', async () => {
  delete window.zabokaDesign
  await render()
  expect(container!.textContent).toBe('')
})

it('shows an inline host error, retains the draft across remount and sends by Enter', async () => {
  submitPrompt.mockRejectedValueOnce(Error('Design is unavailable'))
  await render()
  await act(async () => {
    container!.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(container!.querySelector('[role="alert"]')?.textContent).toBe('Design is unavailable')
  expect(container!.querySelector('textarea')!.value).toBe('  Make a poster  ')
  await act(async () => root!.unmount())
  container!.remove()
  await render()
  expect(container!.querySelector('[role="alert"]')?.textContent).toBe('Design is unavailable')
  await act(async () => container!.querySelector('button')!.click())
  expect(container!.querySelector('textarea')!.value).toBe('')
  expect(container!.querySelector('[role="status"]')?.textContent).toContain('Sent to the Design agent')
})
