import { canEditOpenCanvas, useStore } from '../src/lib/store'

/** Proposed companion contract, not implemented by the inspected Zaboka host. */
export interface DesignPromptRequest {
  requestId: string
  projectId: string
  prompt: string
}
export type DesignPromptAck =
  | { requestId: string; status: 'accepted'; botId: string; taskId: string }
  | { requestId: string; status: 'rejected'; message: string }
export interface DesignGuestBridge {
  version: 1
  submitPrompt(request: DesignPromptRequest): Promise<DesignPromptAck>
}
declare global {
  interface Window {
    /** Only a Design-specific, top-level guest preload may install this. */
    zabokaDesign?: DesignGuestBridge
  }
}

export function designGuestBridge(): DesignGuestBridge | null {
  const bridge = window.zabokaDesign
  return bridge?.version === 1 && typeof bridge.submitPrompt === 'function' ? bridge : null
}

// A failed/uncertain attempt retains its id across panel unmount and retry.
// The companion must deduplicate accepted/in-flight ids; never auto-retry here.
const attempts = new Map<string, { prompt: string; requestId: string }>()

export async function sendDesignPrompt(canvasId: string): Promise<void> {
  const store = useStore.getState()
  if (store.composerSend?.status === 'busy') return
  const prompt = store.composerDrafts[canvasId]?.trim() ?? ''
  if (!prompt) return
  store.setComposerSend({ canvasId, status: 'busy' })
  try {
    if (store.canvas?.id !== canvasId || !canEditOpenCanvas(store)) throw Error('Open an editable canvas first.')
    if (!/^[\w-]{1,100}$/.test(canvasId) || prompt.length > 100000) throw Error('Invalid Design request.')
    const bridge = designGuestBridge()
    if (!bridge) throw Error('The Design window connection is unavailable.')
    let attempt = attempts.get(canvasId)
    if (!attempt || attempt.prompt !== prompt) {
      attempt = { prompt, requestId: crypto.randomUUID() }
      attempts.set(canvasId, attempt)
    }
    const ack = await bridge.submitPrompt({ projectId: canvasId, ...attempt })
    if (!ack || ack.requestId !== attempt.requestId) throw Error('Design returned an invalid acknowledgement.')
    if (ack.status === 'rejected')
      throw Error(typeof ack.message === 'string' && ack.message ? ack.message : 'Design could not accept the request.')
    if (
      ack.status !== 'accepted' ||
      typeof ack.botId !== 'string' ||
      !ack.botId ||
      typeof ack.taskId !== 'string' ||
      !ack.taskId
    )
      throw Error('Design returned an invalid acknowledgement.')
    attempts.delete(canvasId)
    // A caller may replace the draft while a request is pending: preserve it.
    if (useStore.getState().composerDrafts[canvasId]?.trim() === prompt) store.setComposerDraft(canvasId, '')
    store.setComposerSend({ canvasId, status: 'sent', at: Date.now() })
  } catch (error) {
    store.setComposerSend({
      canvasId,
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not send to Design.',
      at: Date.now(),
    })
  }
}
