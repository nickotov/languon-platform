import React, { useCallback, useEffect, useState } from 'react'
import { BookPlusIcon, InfoIcon, XIcon } from 'lucide-react'
import { Button } from '../Button'
import { IconButton } from '../IconButton'
import { Popover, PopoverAnchor, PopoverContent } from '../Popover'
import { BottomSheet } from '../ui/BottomSheet'
import { CollectPanel } from './CollectPanel'
import type { CollectController } from '../../hooks/useCollect'
import type { SelectionRect } from '../../types/texts'

interface CollectLayerProps {
  collect: CollectController
  compact: boolean
}

function invalidCopy(kind: 'cross' | 'long', length: number) {
  return kind === 'cross'
    ? { title: 'Select within one sentence', body: 'Your selection spans more than one sentence. Select a word or short phrase inside a single sentence.' }
    : { title: 'Selection is too long', body: `That’s ${length} characters. Narrow it to a word or short phrase of up to 200 characters.` }
}

export function CollectLayer({ collect, compact }: CollectLayerProps) {
  const { step, selection } = collect
  const [rect, setRect] = useState<SelectionRect | null>(null)
  const panelOpen = step === 'loading' || step === 'pick' || step === 'new' || step === 'duplicate' || step === 'signin'

  const measure = useCallback(() => {
    if (panelOpen) {
      const mark = document.querySelector('[data-mark-active="true"]')
      if (mark) {
        const r = mark.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        return
      }
    }
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const r = sel.getRangeAt(0).getBoundingClientRect()
      if (r.width || r.height) setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
  }, [panelOpen])

  useEffect(() => {
    if (!selection) return
    setRect(selection.rect)
    const raf = window.requestAnimationFrame(measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [selection, measure, step])

  if (step === 'closed' || !selection) return null
  const invalid = selection.kind !== 'valid' ? invalidCopy(selection.kind, selection.text.length) : null

  if (compact) {
    if (!panelOpen) {
      return (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-background-surface px-3 pt-3 shadow-lg" role="region" aria-label="Selected text">
          {invalid ? (
            <div className="flex items-start gap-3" role="status">
              <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-warning-default" aria-hidden />
              <div className="min-w-0 flex-1 text-sm leading-5">
                <p className="font-medium text-text-primary">{invalid.title}</p>
                <p className="text-text-secondary">{invalid.body}</p>
              </div>
              <IconButton icon={<XIcon />} label="Dismiss" variant="ghost" size="md" onClick={collect.close} showTooltip={false} />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                “<span className="font-medium text-text-primary">{selection.text}</span>”
              </p>
              <Button
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={collect.open}
                leadingIcon={<BookPlusIcon className="h-4 w-4" />}
              >
                Add to dictionary
              </Button>
            </div>
          )}
        </div>
      )
    }
    return (
      <BottomSheet
        open
        onClose={collect.close}
        dismissible={!collect.signingIn}
        title={step === 'new' ? 'New dictionary' : step === 'signin' ? 'Sign in to add words' : `Add “${selection.text}”`}
      >
        <div className="-mx-4">
          <CollectPanel collect={collect} showHeader={false} />
        </div>
      </BottomSheet>
    )
  }

  const r = rect ?? selection.rect
  return (
    <Popover open onOpenChange={(o) => !o && collect.close()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          style={{ position: 'fixed', top: r.top, left: r.left, width: r.width, height: r.height, pointerEvents: 'none' }}
        />
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={10}
        collisionPadding={16}
        className={panelOpen ? 'w-96 max-w-full p-0' : 'w-auto max-w-xs p-1'}
        onOpenAutoFocus={(e) => {
          if (!panelOpen) e.preventDefault()
        }}
      >
        {panelOpen ? (
          <CollectPanel collect={collect} showHeader />
        ) : invalid ? (
          <div className="flex gap-2 p-2" role="status">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning-default" aria-hidden />
            <div className="text-sm leading-5">
              <p className="font-medium text-text-primary">{invalid.title}</p>
              <p className="text-text-secondary">{invalid.body}</p>
            </div>
          </div>
        ) : (
          <Button
            size="compact"
            onMouseDown={(e) => e.preventDefault()}
            onClick={collect.open}
            leadingIcon={<BookPlusIcon className="h-4 w-4" />}
          >
            Add to dictionary
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
