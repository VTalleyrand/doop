// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import {
  submitDesign,
  cancelDesign,
  designTask,
  leaveDesignProject,
  useDesignTurns,
  useDesignModels,
  loadDesignModels,
  chooseDesignModel,
  type DesignBridge,
  type DesignModels,
  type DesignUpdate,
} from '../zaboka/designRunner'
import { chatTurns } from '../src/lib/agentChat'
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

it("a Design turn is one of Doop's own chat cards, drawn by its chat", () => {
  const turn = {
    id: 't1',
    project: 'c1',
    prompt: 'A login screen',
    at: 10,
    busy: true,
    messages: [{ id: 'm1', kind: 'text', text: 'Drafting' }],
  }
  const working = chatTurns([designTask(turn, 'u1')], [], 'u1')
  expect(working).toEqual([
    expect.objectContaining({ id: 't1', text: 'A login screen', mine: true, agentName: 'Design', state: 'working' }),
  ])
  const done = designTask(
    {
      ...turn,
      busy: false,
      endedAt: 20,
      messages: [
        ...turn.messages,
        { id: 'm2', kind: 'tool', tool: { name: 'create_frame', ok: true } },
        { id: 'm3', kind: 'text', text: 'Made it.' },
      ],
    },
    'u1',
  )
  expect(chatTurns([done], [], 'u1')[0]).toEqual(
    expect.objectContaining({ state: 'done', reply: 'Drafting\n\nMade it.' }),
  )
  expect(done.endedAt).toBe(20)
  const failed = designTask({ ...turn, busy: false, endedAt: 30, error: 'Design stopped.' })
  expect(chatTurns([failed], [], 'u1')[0]).toEqual(
    expect.objectContaining({ state: 'failed', failureReason: 'Design stopped.', mine: false }),
  )
})

it("the composer's model picker reads and sets the Design agent's model through Zaboka", async () => {
  const listed: DesignModels = {
    current: { instanceId: 'claude', model: 'opus' },
    engines: [
      {
        id: 'claude',
        name: 'Claude',
        kind: 'claudeAgent',
        ready: true,
        default: 'opus',
        models: [
          { id: 'opus', label: 'Opus' },
          { id: 'sonnet', label: 'Sonnet' },
        ],
      },
    ],
  }
  const picker = {
    ...host,
    models: vi.fn(async () => listed),
    setModel: vi.fn(async (pick) => ({ ...listed, current: pick })),
  }
  await loadDesignModels(picker)
  expect(useDesignModels.getState().models?.current?.model).toBe('opus')
  await chooseDesignModel({ instanceId: 'claude', model: 'sonnet' }, picker)
  expect(picker.setModel).toHaveBeenCalledWith({ instanceId: 'claude', model: 'sonnet' })
  expect(useDesignModels.getState().models?.current?.model).toBe('sonnet')
  // a refused pick goes back to what was set, with a word why
  picker.setModel.mockRejectedValueOnce(Error('no'))
  await chooseDesignModel({ instanceId: 'claude', model: 'opus' }, picker)
  expect(useDesignModels.getState().models?.current?.model).toBe('sonnet')
  expect(useDesignModels.getState().error).toMatch(/could not change/)
})
