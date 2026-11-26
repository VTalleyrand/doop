// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useStore } from '../src/lib/store'
import { PromptBar } from '../src/components/PromptBar'
import { TooltipProvider } from '../src/components/ui/tooltip'
import { uploadDesignFiles, useDesignTurns, type DesignBridge } from '../zaboka/designRunner'
import type { Canvas } from '../shared/types'

const mocks = vi.hoisted(() => ({ images: vi.fn(async () => []), addCard: vi.fn() }))
vi.mock('../src/lib/api', () => ({ api: { addCard: mocks.addCard }, ApiError: class extends Error {} }))
vi.mock('../src/lib/auth', () => ({ authClient: { useSession: () => ({ data: { user: { id: 'owner' } } }) } }))
vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
vi.mock('../src/lib/frameClipboard', () => ({ uploadImageFrames: mocks.images }))
vi.mock('../src/components/ModelPicker', () => ({ ModelPicker: () => null }))
vi.mock('../src/components/TeamAllowance', () => ({
  useAllowance: () => ({ allowance: null }),
  meterText: () => null,
  isResidentLimit: () => false,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let container: HTMLDivElement
let host: DesignBridge
beforeEach(() => {
  vi.clearAllMocks()
  history.replaceState(null, '', '/c/project')
  host = {
    version: 1,
    uploadAttachment: vi.fn(async (input) => ({
      attachmentId: input.attachmentId,
      name: input.name,
      bytes: input.data.length,
    })),
    submitPrompt: vi.fn(async (input) => ({ requestId: input.requestId, status: 'accepted' })),
    subscribe: vi.fn(() => () => {}),
    cancel: vi.fn(async () => ({})),
  }
  window.zabokaDesign = host
  useDesignTurns.setState({ turns: [] })
  useStore.setState({
    canvas: { id: 'project', frames: [], pages: [] } as unknown as Canvas,
    composerDrafts: {},
    composerSend: null,
    selectedId: null,
    selectedElement: null,
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${crypto.randomUUID()}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  container?.remove()
  delete window.zabokaDesign
  vi.restoreAllMocks()
})
async function render() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      <TooltipProvider>
        <PromptBar canvasId="project" />
      </TooltipProvider>,
    ),
  )
}
async function pick(files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}
async function send() {
  await act(async () =>
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}
it('attaches HTML, ZIP and PDF through the picker, displays names, supports removal, and sends bytes rather than laptop paths', async () => {
  await render()
  expect(container.querySelector('input[type="file"]')?.getAttribute('accept')).toBeNull()
  expect(container.querySelector('button[aria-label="Attach files"]')).toBeTruthy()
  const html = new File(['<h1>Home</h1>'], 'home.html', { type: 'text/html' })
  const zip = new File([new Uint8Array([80, 75, 3, 4, 0, 255])], 'drafts.zip', { type: 'application/zip' })
  const pdf = new File(['%PDF-1.7'], 'notes.pdf', { type: 'application/pdf' })
  await pick([html, zip, pdf])
  expect(container.textContent).toContain('home.html')
  expect(container.textContent).toContain('drafts.zip')
  expect(container.textContent).toContain('notes.pdf')
  expect(container.querySelector('img')).toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Remove notes.pdf"]')!.click())
  expect(container.textContent).not.toContain('notes.pdf')
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!.disabled).toBe(false)
  await send()
  expect(host.uploadAttachment).toHaveBeenCalledTimes(2)
  const calls = vi.mocked(host.uploadAttachment!).mock.calls
  expect([...calls[1]![0].data]).toEqual([80, 75, 3, 4, 0, 255])
  expect(host.submitPrompt).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: 'project', attachmentIds: calls.map(([input]) => input.attachmentId) }),
  )
  expect(mocks.images).toHaveBeenCalledWith('project', [], expect.anything())
  expect(mocks.addCard).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain('home.html')
  expect(useDesignTurns.getState().turns[0]?.attachments?.map((file) => file.name)).toEqual(['home.html', 'drafts.zip'])
})
it('keeps files and the draft on failure and reuses acknowledged uploads on retry', async () => {
  await render()
  useStore.getState().setComposerDraft('project', 'Use this design')
  await pick([new File(['<p>reference</p>'], 'reference.html', { type: 'text/html' })])
  vi.mocked(host.submitPrompt).mockRejectedValueOnce(new Error('connection unavailable'))
  await send()
  expect(container.textContent).toContain('connection unavailable')
  expect(container.textContent).toContain('reference.html')
  expect(useStore.getState().composerDrafts.project).toBe('Use this design')
  await send()
  expect(host.uploadAttachment).toHaveBeenCalledTimes(1)
  expect(host.submitPrompt).toHaveBeenCalledTimes(2)
  expect(useStore.getState().composerDrafts.project).toBe('')
})
it('keeps image reference frames alongside file attachments', async () => {
  await render()
  const image = new File([new Uint8Array([137, 80, 78, 71])], 'screen.png', { type: 'image/png' })
  const html = new File(['<h1>Inbox</h1>'], 'inbox.html', { type: 'text/html' })
  await pick([image, html])
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('screen.png')
  await send()
  expect(mocks.images).toHaveBeenCalledWith('project', [image], expect.anything())
  expect(host.uploadAttachment).toHaveBeenCalledTimes(1)
})
it('reports size/count/empty errors and refuses an older host without discarding files', async () => {
  await render()
  const empty = new File([], 'empty.zip')
  await pick([empty])
  expect(container.textContent).toContain('empty.zip is empty')
  const large = new File(['x'], 'huge.zip')
  Object.defineProperty(large, 'size', { value: 64 * 1024 * 1024 + 1 })
  await pick([large])
  expect(container.textContent).toContain('64 MB')
  const files = Array.from({ length: 5 }, (_, i) => new File(['x'], `file-${i}.txt`))
  await pick(files)
  expect(container.textContent).toContain('Up to 4 files')
  delete host.uploadAttachment
  await send()
  expect(container.textContent).toContain('Update Zaboka Desktop')
  expect(container.textContent).toContain('file-0.txt')
  expect(host.submitPrompt).not.toHaveBeenCalled()
})
it('retries a lost upload acknowledgement with the same id and refuses cross-project uploads', async () => {
  const file = new File(['<h1>Home</h1>'], 'home.html')
  vi.mocked(host.uploadAttachment!).mockRejectedValueOnce(new Error('lost acknowledgement'))
  await expect(uploadDesignFiles('project', [file], host)).rejects.toThrow('lost acknowledgement')
  await uploadDesignFiles('project', [file], host)
  const calls = vi.mocked(host.uploadAttachment!).mock.calls
  expect(calls[0]![0].attachmentId).toBe(calls[1]![0].attachmentId)
  await expect(uploadDesignFiles('other', [file], host)).rejects.toThrow('current Design project')
})
