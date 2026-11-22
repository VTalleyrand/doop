// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import {
  submitDesign,
  cancelDesign,
  leaveDesignProject,
  useDesignTurns,
  type DesignBridge,
  type DesignUpdate,
} from '../zaboka/designRunner'
let listener: (update: DesignUpdate) => void
let id: string
const stop = vi.fn()
const host: DesignBridge = {
  version: 1,
  submitPrompt: vi.fn(async (input) => {
    id = input.requestId
    return { requestId: id, status: 'accepted' }
  }),
  subscribe: vi.fn((_id, callback) => {
    listener = callback
    return stop
  }),
  cancel: vi.fn(async () => ({})),
}
beforeEach(() => {
  vi.clearAllMocks()
  useDesignTurns.setState({ turns: [] })
  history.replaceState(null, '', '/c/project')
})
it('submits only project and prompt authority and replaces growing snapshots', async () => {
  await submitDesign('project', 'Edit the canvas', host)
  expect(host.submitPrompt).toHaveBeenCalledWith({ requestId: id, projectId: 'project', prompt: 'Edit the canvas' })
  listener({ requestId: 'other', busy: false, messages: [] })
  expect(useDesignTurns.getState().turns[0]?.busy).toBe(true)
  listener({ requestId: id, busy: true, messages: [{ id: 'reply', kind: 'text', text: 'Hello' }] })
  listener({
    requestId: id,
    busy: false,
    messages: [
      { id: 'reply', kind: 'text', text: 'Hello world' },
      { id: 'tool', kind: 'activity', tool: { name: 'edit_frame', ok: true } },
    ],
  })
  expect(useDesignTurns.getState().turns[0]?.messages).toHaveLength(2)
  expect(stop).toHaveBeenCalledOnce()
})
it('cancels through the host and waits for the final snapshot', async () => {
  await submitDesign('project', 'Edit', host)
  await cancelDesign(id, host)
  expect(host.cancel).toHaveBeenCalledWith(id)
  expect(useDesignTurns.getState().turns[0]?.busy).toBe(true)
  listener({ requestId: id, busy: false, messages: [] })
  expect(useDesignTurns.getState().turns[0]?.busy).toBe(false)
})
it('refuses cross project submission and releases observations on navigation', async () => {
  await expect(submitDesign('other', 'Edit', host)).rejects.toThrow('current Design project')
  expect(host.submitPrompt).not.toHaveBeenCalled()
  await submitDesign('project', 'Edit', host)
  leaveDesignProject('project')
  expect(stop).toHaveBeenCalledOnce()
  expect(useDesignTurns.getState().turns[0]?.busy).toBe(false)
})
it('reports rejection and transport errors without another provider', async () => {
  await expect(
    submitDesign('project', 'Edit', {
      ...host,
      submitPrompt: async (input) => ({
        requestId: input.requestId,
        status: 'rejected',
        message: 'Uncertain acceptance',
      }),
    }),
  ).rejects.toThrow('Uncertain acceptance')
  expect(useDesignTurns.getState().turns[0]?.error).toBe('Uncertain acceptance')
  await submitDesign('project', 'Edit', host)
  listener({ requestId: id, error: 'Design connection closed.' })
  expect(useDesignTurns.getState().turns[1]?.error).toBe('Design connection closed.')
})
