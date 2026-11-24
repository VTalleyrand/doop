import { create } from 'zustand'

export interface DesignMessage {
  id: string
  kind: string
  text?: string
  tool?: { name: string; ok?: boolean; stopped?: boolean }
  job?: { state: string; note?: string }
}
export interface DesignUpdate {
  requestId: string
  busy?: boolean
  error?: string
  superseded?: boolean
  messages?: DesignMessage[]
}
export interface DesignBridge {
  version: number
  submitPrompt(input: {
    requestId: string
    projectId: string
    prompt: string
  }): Promise<{ requestId: string; status: string; message?: string }>
  subscribe(requestId: string, listener: (update: DesignUpdate) => void): () => void
  cancel(requestId: string): Promise<unknown>
}
declare global {
  interface Window {
    zabokaDesign?: DesignBridge
  }
}
export interface DesignTurn {
  id: string
  project: string
  prompt: string
  busy: boolean
  messages: DesignMessage[]
  error?: string
}
export const useDesignTurns = create<{ turns: DesignTurn[] }>(() => ({ turns: [] }))
const subscriptions = new Map<string, () => void>()
function patch(id: string, update: Partial<DesignTurn>) {
  useDesignTurns.setState((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, ...update } : t)) }))
}
function bridge(): DesignBridge {
  const host = window.zabokaDesign
  if (host?.version !== 1) throw Error('Open this canvas in Zaboka Design to use the Design agent.')
  return host
}
export async function submitDesign(project: string, prompt: string, host = bridge()) {
  if (location.pathname !== `/c/${project}` && location.pathname !== `/c/${project}/`)
    throw Error('Open the current Design project first.')
  if (useDesignTurns.getState().turns.some((t) => t.project === project && t.busy))
    throw Error('Wait for Design or stop the current turn first.')
  const id = crypto.randomUUID()
  useDesignTurns.setState((s) => ({ turns: [...s.turns, { id, project, prompt, busy: true, messages: [] }] }))
  try {
    const receipt = await host.submitPrompt({ requestId: id, projectId: project, prompt })
    if (receipt.requestId !== id || receipt.status !== 'accepted')
      throw Error(receipt.message ?? 'Design did not accept the request.')
    if (location.pathname !== `/c/${project}` && location.pathname !== `/c/${project}/`) {
      patch(id, { busy: false, error: 'Project changed. Inspect the Design conversation for the turn outcome.' })
      return
    }
    const stop = host.subscribe(id, (update) => {
      if (update.requestId !== id) return
      patch(id, {
        busy: Boolean(update.busy) && !update.error,
        ...(update.messages ? { messages: update.messages } : {}),
        ...(update.error ? { error: update.error } : {}),
      })
      if (!update.busy || update.error) {
        subscriptions.get(id)?.()
        subscriptions.delete(id)
      }
    })
    if (useDesignTurns.getState().turns.find((t) => t.id === id)?.busy) subscriptions.set(id, stop)
    else stop()
  } catch (error) {
    patch(id, { busy: false, error: error instanceof Error ? error.message : 'Design connection failed.' })
    throw error
  }
}
export async function cancelDesign(id: string, host = bridge()) {
  try {
    await host.cancel(id)
  } catch (error) {
    patch(id, { error: error instanceof Error ? error.message : 'Design could not stop the turn.' })
    return
  }
  // Keep observing until the host confirms the turn has stopped.
}
export function leaveDesignProject(project: string) {
  for (const turn of useDesignTurns.getState().turns) {
    if (turn.project !== project) continue
    subscriptions.get(turn.id)?.()
    subscriptions.delete(turn.id)
    if (turn.busy)
      patch(turn.id, { busy: false, error: 'Project closed. Inspect the Design conversation for the turn outcome.' })
  }
}
