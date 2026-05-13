/**
 * Document-style transcript: user messages in a soft gray bubble (right-aligned),
 * assistant messages as plain prose (left-aligned, no bubble).
 */

import { Terminal } from 'lucide-react'
import type { ChatMessage, Thread } from '../types'

interface TranscriptProps {
  thread: Thread | null
  messages: ChatMessage[]
}

export function Transcript({ thread, messages }: TranscriptProps) {
  if (!thread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-12 h-12 rounded-xl border border-rc-border bg-white flex items-center justify-center mb-4">
          <Terminal className="w-5 h-5 text-rc-muted" strokeWidth={1.5} />
        </div>
        <h3 className="text-[14px] font-medium text-rc-text mb-1">
          No thread selected
        </h3>
        <p className="text-[12.5px] text-rc-muted max-w-xs leading-relaxed">
          Pick a thread on the left, or start a new one with the composer below.
        </p>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12.5px] text-rc-muted">
        Empty thread — say something to get started.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-8 py-8 space-y-7">
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="flex justify-end">
              <div className="bg-[#ececec] text-rc-text rounded-2xl px-4 py-2.5 text-[13.5px] max-w-[85%] leading-relaxed whitespace-pre-wrap">
                {msg.body}
              </div>
            </div>
          ) : (
            <div
              key={msg.id}
              className="text-[13.5px] text-rc-text leading-[1.65] whitespace-pre-wrap"
            >
              {msg.body}
            </div>
          ),
        )}
      </div>
    </div>
  )
}
