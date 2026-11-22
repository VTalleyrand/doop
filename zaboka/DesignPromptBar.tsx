import { useStore } from '../src/lib/store'
import { Button } from '../src/components/ui/button'
import { Textarea } from '../src/components/ui/textarea'
import { Note } from '../src/components/ui/note'
import { designGuestBridge, sendDesignPrompt } from './designBridge'

/** Dormant until the companion installs the versioned Design-only capability. */
export function DesignPromptBar({ canvasId }: { canvasId: string }) {
  const text = useStore((s) => s.composerDrafts[canvasId] ?? '')
  const send = useStore((s) => (s.composerSend?.canvasId === canvasId ? s.composerSend : null))
  const busy = useStore((s) => s.composerSend?.status === 'busy')
  if (!designGuestBridge()) return null
  return (
    <form
      className="flex flex-col gap-2 border-t border-line p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void sendDesignPrompt(canvasId)
      }}
    >
      <Textarea
        aria-label="Ask the Design agent"
        placeholder="What would you like to design?"
        value={text}
        maxLength={100000}
        disabled={busy}
        onChange={(event) => useStore.getState().setComposerDraft(canvasId, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void sendDesignPrompt(canvasId)
          }
        }}
      />
      {send?.status === 'error' && <Note role="alert">{send.message}</Note>}
      {send?.status === 'sent' && <Note role="status">Sent to the Design agent.</Note>}
      <Button type="submit" disabled={busy || !text.trim()}>
        {busy ? 'Sending…' : 'Send to Design'}
      </Button>
    </form>
  )
}
