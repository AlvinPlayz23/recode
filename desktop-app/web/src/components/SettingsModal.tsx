/**
 * Settings panel for mock app preferences.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Moon, Sun, X } from 'lucide-react'
import gsap from 'gsap'
import { cn } from '../lib/cn'
import type { ThemeMode } from '../types'
import type { RecodeRuntimeMode } from '../desktop-rpc'

interface SettingsModalProps {
  open: boolean
  theme: ThemeMode
  runtimeMode: RecodeRuntimeMode
  recodeRepoRoot?: string
  detectedRepoRoot?: string
  onClose: () => void
  onChangeTheme: (theme: ThemeMode) => void
  onChangeRuntimeMode: (mode: RecodeRuntimeMode) => void
  onChooseRecodeRepo: () => void
}

const SECTIONS = ['General', 'Models', 'Approval', 'Appearance'] as const
type Section = (typeof SECTIONS)[number]

export function SettingsModal({
  open,
  theme,
  runtimeMode,
  recodeRepoRoot,
  detectedRepoRoot,
  onClose,
  onChangeTheme,
  onChangeRuntimeMode,
  onChooseRecodeRepo,
}: SettingsModalProps) {
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
        className="relative bg-rc-elevated border border-rc-border w-full max-w-[720px] h-[460px] rounded-xl shadow-2xl overflow-hidden flex"
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
                  ? 'bg-rc-hover-strong text-rc-text'
                  : 'text-rc-text hover:bg-rc-hover',
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
              className="w-7 h-7 rounded-md flex items-center justify-center text-rc-muted hover:text-rc-text hover:bg-rc-hover transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {section === 'General' && (
              <>
                <Row label="Account" value="Personal" />
                <RuntimeModeRow
                  runtimeMode={runtimeMode}
                  recodeRepoRoot={recodeRepoRoot}
                  detectedRepoRoot={detectedRepoRoot}
                  onChangeRuntimeMode={onChangeRuntimeMode}
                  onChooseRecodeRepo={onChooseRecodeRepo}
                />
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
                <ThemeRow theme={theme} onChangeTheme={onChangeTheme} />
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

function RuntimeModeRow({
  runtimeMode,
  recodeRepoRoot,
  detectedRepoRoot,
  onChangeRuntimeMode,
  onChooseRecodeRepo,
}: {
  runtimeMode: RecodeRuntimeMode
  recodeRepoRoot?: string
  detectedRepoRoot?: string
  onChangeRuntimeMode: (mode: RecodeRuntimeMode) => void
  onChooseRecodeRepo: () => void
}) {
  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[12.5px] text-rc-text">Runtime mode</span>
        <span className="text-[12px] text-rc-muted uppercase">{runtimeMode}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ModeButton
          active={runtimeMode === 'dev'}
          label="Dev"
          onClick={() => onChangeRuntimeMode('dev')}
        />
        <ModeButton
          active={runtimeMode === 'prod'}
          label="Prod"
          onClick={() => onChangeRuntimeMode('prod')}
        />
      </div>
      <div className="rounded-lg border border-rc-border bg-rc-card px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-rc-faint mb-1">
              Recode repo
            </div>
            <div className="text-[11.5px] mono text-rc-muted break-all">
              {recodeRepoRoot ?? detectedRepoRoot ?? 'Not configured'}
            </div>
          </div>
          <button
            onClick={onChooseRecodeRepo}
            className="shrink-0 px-2.5 py-1.5 rounded-md border border-rc-border text-[12px] text-rc-text hover:bg-rc-hover transition-colors"
          >
            Choose
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-10 rounded-lg border px-3 flex items-center justify-between text-[12.5px] transition-colors',
        active
          ? 'border-rc-accent bg-rc-accent-soft text-rc-accent'
          : 'border-rc-border bg-rc-card text-rc-text hover:bg-rc-hover',
      )}
    >
      <span>{label}</span>
      {active && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
    </button>
  )
}

function ThemeRow({
  theme,
  onChangeTheme,
}: {
  theme: ThemeMode
  onChangeTheme: (theme: ThemeMode) => void
}) {
  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[12.5px] text-rc-text">Theme</span>
        <span className="text-[12px] text-rc-muted capitalize">{theme}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ThemeButton
          active={theme === 'light'}
          icon={<Sun className="w-3.5 h-3.5" strokeWidth={1.7} />}
          label="Light"
          onClick={() => onChangeTheme('light')}
        />
        <ThemeButton
          active={theme === 'dark'}
          icon={<Moon className="w-3.5 h-3.5" strokeWidth={1.7} />}
          label="Dark"
          onClick={() => onChangeTheme('dark')}
        />
      </div>
    </div>
  )
}

function ThemeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-10 rounded-lg border px-3 flex items-center justify-between text-[12.5px] transition-colors',
        active
          ? 'border-rc-accent bg-rc-accent-soft text-rc-accent'
          : 'border-rc-border bg-rc-card text-rc-text hover:bg-rc-hover',
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {active && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
    </button>
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
            on ? 'bg-rc-text' : 'bg-rc-hover-strong',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-rc-bg shadow transition-all',
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
