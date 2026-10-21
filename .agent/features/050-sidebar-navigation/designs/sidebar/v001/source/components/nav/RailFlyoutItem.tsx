import React, { useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Popover, PopoverAnchor, PopoverContent } from '../Popover'
import { RailButton } from './RailItem'
import { ResourcePanel } from './ResourcePanel'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useHoverIntent } from '../../hooks/useHoverIntent'
import { isSectionActive } from '../../utils/navigation'
import type { NavSection } from '../../types/navigation'

/**
 * Collapsed-rail entry with a contextual flyout.
 * Mouse: hover opens after a short delay; moving into the panel keeps it open.
 * Click / Enter / Space / ArrowRight / tap: opens and pins the panel, focus moves inside.
 * Escape or outside click closes; focus returns to the rail icon when it was inside.
 */
export function RailFlyoutItem({ section }: { section: NavSection }) {
  const { t } = usePreferences()
  const { pathname } = useLocation()
  const { open, setOpen, isPinned, hoverProps } = useHoverIntent()
  const anchorRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const active = isSectionActive(section, pathname)
  const panelId = `flyout-${section.id}`

  return (
    <li>
      <Popover open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <PopoverAnchor asChild>
          <div ref={anchorRef} className="flex justify-center" {...hoverProps}>
            <RailButton
              ref={buttonRef}
              icon={section.icon}
              label={t(section.labelKey)}
              active={active}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              onClick={() => {
                if (open && !isPinned()) setOpen(true, true)
                else setOpen(!open, true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  setOpen(true, true)
                }
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          id={panelId}
          side="right"
          align="start"
          sideOffset={14}
          collisionPadding={12}
          className="w-72 p-0"
          {...hoverProps}
          onOpenAutoFocus={(event) => {
            if (!isPinned()) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (document.activeElement === document.body) buttonRef.current?.focus()
          }}
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node)) event.preventDefault()
          }}
        >
          <ResourcePanel section={section} variant="flyout" onNavigate={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </li>
  )
}

