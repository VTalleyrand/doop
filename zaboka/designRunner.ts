import { useMemo } from 'react'
import { create } from 'zustand'
import type { AgentTask } from '../shared/types'
import { useStore } from '../src/lib/store'
import { authClient } from '../src/lib/auth'
import { hostedProducts } from './designPolicy'

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
export interface DesignAttachment {
  attachmentId: string
  name: string
  bytes: number
}
export const DESIGN_FILE_MAX_BYTES = 64 * 1024 * 1024
export const DESIGN_MAX_ATTACHMENTS = 4
export interface DesignBridge {
  version: number
  uploadAttachment?(input: {
    attachmentId: string
    projectId: string
    name: string
    data: Uint8Array
  }): Promise<DesignAttachment>
  submitPrompt(input: {
    requestId: string
    projectId: string
    prompt: string
    attachmentIds?: string[]
  }): Promise<{ requestId: string; status: string; message?: string }>
  subscribe(requestId: string, listener: (update: DesignUpdate) => void): () => void
  cancel(requestId: string): Promise<unknown>
  /** The Design agent's model and the owner's engines (newer Zaboka Desktop). */
  models?(): Promise<DesignModels>
  /** Sets the Design agent's own model; Zaboka checks it against its engines. */
  setModel?(pick: DesignModelPick): Promise<DesignModels>
}
export interface DesignModelPick {
  instanceId: string
  model: string
}
export interface DesignEngine {
  id: string
  name: string
  kind: string
  ready: boolean
  reason?: string
  default: string
  models: Array<{ id: string; label: string }>
}
export interface DesignModels {
  current: DesignModelPick | null
  engines: DesignEngine[]
}
declare global {
  interface Window {
    zabokaDesign?: DesignBridge
  }
}
export interface DesignTurn {
  id: string
  project: string
  /** what the person typed, as the chat shows it (the prompt sent also carries the canvas context) */
  prompt: string
  attachments?: DesignAttachment[]
  at: number
  endedAt?: number
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

// A failed send keeps File objects in the composer. Reuse an acknowledged upload
// on retry, scoped to this project and bridge, without trusting a caller's path.
const uploaded = new WeakMap<
  File,
  { project: string; host: DesignBridge; attachmentId: string; receipt?: DesignAttachment }
>()
export async function uploadDesignFiles(project: string, files: File[], host = bridge()): Promise<DesignAttachment[]> {
  if (location.pathname !== `/c/${project}` && location.pathname !== `/c/${project}/`)
    throw Error('Open the current Design project first.')
  if (!files.length) return []
  if (!host.uploadAttachment) throw Error('Update Zaboka Desktop to attach files to Design messages.')
  if (files.length > DESIGN_MAX_ATTACHMENTS) throw Error('Attach up to four files.')
  for (const file of files) {
    if (!file.size || file.size > DESIGN_FILE_MAX_BYTES)
      throw Error(`${file.name}: attach a nonempty file up to 64 MB.`)
  }
  const receipts: DesignAttachment[] = []
  for (const file of files) {
    const saved = uploaded.get(file)
    if (saved?.project === project && saved.host === host && saved.receipt) {
      receipts.push(saved.receipt)
      continue
    }
    const attachmentId = saved?.project === project && saved.host === host ? saved.attachmentId : crypto.randomUUID()
    uploaded.set(file, { project, host, attachmentId })
    const receipt = await host.uploadAttachment({
      attachmentId,
      projectId: project,
      name: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
    })
    if (receipt.attachmentId !== attachmentId || receipt.bytes !== file.size)
      throw Error('Design did not confirm the attachment.')
    uploaded.set(file, { project, host, attachmentId, receipt })
    receipts.push(receipt)
  }
  return receipts
}

export async function submitDesign(
  project: string,
  prompt: string,
  host = bridge(),
  shown = prompt,
  attachments: DesignAttachment[] = [],
) {
  if (location.pathname !== `/c/${project}` && location.pathname !== `/c/${project}/`)
    throw Error('Open the current Design project first.')
  if (useDesignTurns.getState().turns.some((t) => t.project === project && t.busy))
    throw Error('Wait for Design or stop the current turn first.')
  const id = crypto.randomUUID()
  useDesignTurns.setState((s) => ({
    turns: [
      ...s.turns,
      {
        id,
        project,
        prompt: shown,
        ...(attachments.length ? { attachments } : {}),
        at: Date.now(),
        busy: true,
        messages: [],
      },
    ],
  }))
  try {
    const receipt = await host.submitPrompt({
      requestId: id,
      projectId: project,
      prompt,
      ...(attachments.length ? { attachmentIds: attachments.map((file) => file.attachmentId) } : {}),
    })
    if (receipt.requestId !== id || receipt.status !== 'accepted')
      throw Error(receipt.message ?? 'Design did not accept the request.')
    if (location.pathname !== `/c/${project}` && location.pathname !== `/c/${project}/`) {
      patch(id, {
        busy: false,
        endedAt: Date.now(),
        error: 'Project changed. Inspect the Design conversation for the turn outcome.',
      })
      return
    }
    const stop = host.subscribe(id, (update) => {
      if (update.requestId !== id) return
      const busy = Boolean(update.busy) && !update.error
      patch(id, {
        busy,
        ...(busy ? {} : { endedAt: Date.now() }),
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
    patch(id, {
      busy: false,
      endedAt: Date.now(),
      error: error instanceof Error ? error.message : 'Design connection failed.',
    })
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
      patch(turn.id, {
        busy: false,
        endedAt: Date.now(),
        error: 'Project closed. Inspect the Design conversation for the turn outcome.',
      })
  }
}

/** The name Zaboka's Design agent goes by in Doop's chat and activity. */
export const DESIGN_AGENT = 'Design'

/** One Zaboka Design turn as one of Doop's own agent tasks (a composer card),
 *  so the Agents tab's chat, Recent tasks and the working badges draw it
 *  exactly as they draw Doop's own agents. Its answer is the turn's text. */
export function designTask(turn: DesignTurn, userId?: string): AgentTask {
  const reply = turn.messages
    .filter((m) => !m.tool && m.text?.trim())
    .map((m) => m.text!.trim())
    .join('\n\n')
  const ended = turn.endedAt ?? turn.at
  return {
    id: turn.id,
    agentName: DESIGN_AGENT,
    color: '#6466e9',
    status: [turn.prompt, ...(turn.attachments ?? []).map((file) => `Attached: ${file.name}`)].join('\n'),
    startedAt: turn.at,
    claimedAt: turn.at,
    queuedBy: 'You',
    ...(userId ? { queuedByUserId: userId } : {}),
    ...(turn.busy ? {} : turn.error ? { failedAt: ended, failureReason: turn.error } : { endedAt: ended }),
    ...(reply ? { reply } : {}),
  }
}

/** Doop's agent tasks for this canvas, with Zaboka Design's turns among them
 *  in local Design (hosted Doop: only its own). */
export function useAgentTasks(): AgentTask[] {
  const tasks = useStore((s) => s.tasks)
  const project = useStore((s) => s.canvas?.id)
  const turns = useDesignTurns((s) => s.turns)
  const { data: session } = authClient.useSession()
  const userId = session?.user.id
  return useMemo(
    () =>
      hostedProducts
        ? tasks
        : [...tasks, ...turns.filter((t) => t.project === project).map((t) => designTask(t, userId))],
    [tasks, turns, project, userId],
  )
}

/** The turn Design is working on for this canvas, if any (the composer's Stop). */
export function useBusyDesignTurn(canvasId: string): string | null {
  return useDesignTurns((s) => s.turns.find((t) => t.project === canvasId && t.busy)?.id ?? null)
}

/** The composer's model picker: what the Design agent runs on, from Zaboka. */
export const useDesignModels = create<{ models: DesignModels | null; error?: string }>(() => ({ models: null }))
export async function loadDesignModels(host = window.zabokaDesign) {
  if (typeof host?.models !== 'function') return
  try {
    useDesignModels.setState({ models: await host.models(), error: undefined })
  } catch {
    useDesignModels.setState({ error: 'Zaboka could not list the models.' })
  }
}
export async function chooseDesignModel(pick: DesignModelPick, host = window.zabokaDesign) {
  if (typeof host?.setModel !== 'function') return
  const before = useDesignModels.getState().models
  if (before) useDesignModels.setState({ models: { ...before, current: pick }, error: undefined })
  try {
    useDesignModels.setState({ models: await host.setModel(pick), error: undefined })
  } catch {
    useDesignModels.setState({ models: before, error: 'Zaboka could not change the model.' })
  }
}
