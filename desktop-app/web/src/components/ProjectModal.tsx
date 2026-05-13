/**
 * Light-theme repository picker. Mock list for now.
 */

import { useEffect, useRef } from 'react'
import { ChevronRight, Folder } from 'lucide-react'
import gsap from 'gsap'
import { pickerProjects, type PickerEntry } from '../mock-data'

interface ProjectModalProps {
  open: boolean
  onClose: () => void
  onSelect: (entry: PickerEntry) => void
}

export function ProjectModal({ open, onClose, onSelect }: ProjectModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { scale: 0.96, opacity: 0, y: 10 },
        { scale: 1, opacity: 1, y: 0, duration: 0.25, ease: 'expo.out' },
      )
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={cardRef}
        className="relative bg-white border border-rc-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-rc-border-soft">
          <h3 className="text-[13px] font-semibold text-rc-text">
            Open workspace
          </h3>
          <p className="text-[12px] text-rc-muted mt-0.5">
            Pick a folder for Recode to operate inside.
          </p>
        </div>
        <div className="p-1.5 max-h-[360px] overflow-y-auto">
          {pickerProjects.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/[0.04] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-md border border-rc-border bg-rc-bg flex items-center justify-center text-rc-muted">
                <Folder className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-rc-text truncate">
                  {entry.name}
                </div>
                <div className="text-[11px] mono text-rc-faint truncate">
                  {entry.path}
                </div>
              </div>
              <ChevronRight
                className="w-4 h-4 text-rc-faint group-hover:text-rc-muted transition-colors"
                strokeWidth={1.5}
              />
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-rc-border-soft flex justify-end bg-rc-bg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] text-rc-muted hover:text-rc-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
