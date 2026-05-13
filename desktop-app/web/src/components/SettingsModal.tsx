/**
 * Mock settings panel. Just visual surface for Phase 1 — wires nothing yet.
 */

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import gsap from 'gsap'
import { cn } from '../lib/cn'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

const SECTIONS = ['General', 'Models', 'Approval', 'Appearance'] as const
type Section = (typeof SECTIONS)[number]

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [section, setSection] = useState<Section>('General')

  useEffect(() => {
    if (open && cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { scale: 0.97, opacity: 0, y: 8 },
        { scale: 1, opacity: 1, y: 0, duration: 0.22, ease: 'expo.out' },
      )
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={cardRef}
        className="relative bg-white border border-rc-border w-full max-w-[720px] h-[460px] rounded-xl shadow-2xl overflow-hidden flex"
      >
        {/* left rail */}
        <div className="w-[160px] shrink-0 bg-rc-sidebar border-r border-rc-border-soft p-2 flex flex-col">
          <div className="px-2 py-2 text-[11px] uppercase tracking-wider text-rc-faint font-semibold">
            Settings
          </div>
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={cn(
                'w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors',
                section === s
                  ? 'bg-black/[0.06] text-rc-text'
                  : 'text-rc-text hover:bg-black/[0.04]',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* main */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-11 px-4 flex items-center justify-between border-b border-rc-border-soft">
            <span className="text-[13px] font-medium text-rc-text">
              {section}
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-rc-muted hover:text-rc-text hover:bg-black/5 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {section === 'General' && (
              <>
                <Row label="Account" value="Personal" />
                <Row label="Default workspace" value="~/work/recode-scratch" />
                <Row label="Auto-open last session" toggle />
                <Row label="Confirm on quit" toggle defaultOn />
              </>
            )}
            {section === 'Models' && (
              <>
                <Row label="Default model" value="Claude 3.5 Sonnet" />
                <Row label="Default reasoning" value="Medium" />
                <Row label="Stream tool output" toggle defaultOn />
              </>
            )}
            {section === 'Approval' && (
              <>
                <Row label="Approval mode" value="auto-edits" />
                <Row label="Bash needs approval" toggle defaultOn />
                <Row label="Edits need approval" toggle />
              </>
            )}
            {section === 'Appearance' && (
              <>
                <Row label="Theme" value="Light" />
                <Row label="Compact sidebar" toggle />
                <Row label="Show status bar" toggle />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  toggle,
  defaultOn,
}: {
  label: string
  value?: string
  toggle?: boolean
  defaultOn?: boolean
}) {
  const [on, setOn] = useState(!!defaultOn)
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[12.5px] text-rc-text">{label}</span>
      {toggle ? (
        <button
          onClick={() => setOn((o) => !o)}
          className={cn(
            'w-9 h-5 rounded-full relative transition-colors',
            on ? 'bg-rc-text' : 'bg-[#d6d6d6]',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
              on ? 'left-[18px]' : 'left-0.5',
            )}
          />
        </button>
      ) : (
        <span className="text-[12px] text-rc-muted">{value}</span>
      )}
    </div>
  )
}
