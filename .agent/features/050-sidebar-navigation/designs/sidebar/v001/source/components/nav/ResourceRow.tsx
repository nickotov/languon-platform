import React from 'react'
import { useNavigate } from 'react-router-dom'
import { PinIcon } from 'lucide-react'
import { Tooltip } from '../Tooltip'
import { resourcePath } from '../../utils/navigation'
import type { Resource } from '../../types/navigation'

type ResourceRowProps = {
  resource: Resource
  active: boolean
  /** Indent under a parent section label (expanded sidebar / drawer). */
  inset?: boolean
  touch?: boolean
  onNavigate?: () => void
}

export function ResourceRow({ resource, active, inset = false, touch = false, onNavigate }: ResourceRowProps) {
  const navigate = useNavigate()
  const path = resourcePath(resource)
  const meta = resource.languagePair ?? resource.folder

  return (
    <li>
      <Tooltip content={meta ? `${resource.title} · ${meta}` : resource.title} placement="right" delay={700}>
        <a
          href={path}
          aria-current={active ? 'page' : undefined}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return
            event.preventDefault()
            navigate(path)
            onNavigate?.()
          }}
          className={[
            'relative flex items-center gap-2 rounded-lg pr-2 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus',
            touch ? 'h-11' : 'h-8',
            inset ? 'pl-10' : 'pl-3',
            active
              ? 'bg-background-elevated font-medium text-text-primary shadow-elevation-sm'
              : 'text-text-secondary hover:bg-background-elevated hover:text-text-primary'
          ].join(' ')}
        >
          {inset && (
            <span
              aria-hidden="true"
              className={`absolute left-5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
                active ? 'bg-primary-default' : 'bg-border-strong'
              }`}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{resource.title}</span>
          {resource.languagePair && (
            <span className="shrink-0 text-xs tabular-nums text-text-tertiary">{resource.languagePair}</span>
          )}
          {!resource.languagePair && resource.pinned && (
            <PinIcon className="h-3 w-3 shrink-0 text-text-tertiary" aria-label="Pinned" />
          )}
        </a>
      </Tooltip>
    </li>
  )
}

