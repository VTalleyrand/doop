import { useStore } from '../src/lib/store'
import { cancelDesign, useDesignTurns } from './designRunner'

export function DesignConversation({ className }: { className?: string }) {
  const project = useStore((s) => s.canvas?.id)
  const turns = useDesignTurns((s) => s.turns)
  return (
    <section aria-label="Design conversation" className={`${className ?? ''} overflow-y-auto px-3 py-3 text-body`}>
      {turns
        .filter((t) => t.project === project)
        .map((turn) => (
          <div key={turn.id} className="mb-4 flex flex-col gap-2">
            <p className="self-end whitespace-pre-wrap rounded-card bg-sub px-2.5 py-1.5">{turn.prompt}</p>
            <strong>Design</strong>
            {turn.messages.map((message) => (
              <p key={message.id} className="whitespace-pre-wrap break-words">
                {message.tool
                  ? `${message.tool.name} · ${message.tool.stopped ? 'Stopped' : message.tool.ok === undefined ? 'Working' : message.tool.ok ? 'Done' : 'Failed'}`
                  : message.text}
                {message.job && ` · ${message.job.state}${message.job.note ? `: ${message.job.note}` : ''}`}
              </p>
            ))}
            {turn.error && <p role="alert">{turn.error}</p>}
            {turn.busy && <button onClick={() => void cancelDesign(turn.id)}>Stop Design</button>}
          </div>
        ))}
    </section>
  )
}
