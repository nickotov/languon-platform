import React from 'react'
import { Card } from '../Card'

interface SettingsSectionProps {
  title: string
  description?: string
  /** Optional control rendered on the right of the section header. */
  action?: React.ReactNode
  /** Renders the section with danger-toned framing. */
  tone?: 'default' | 'danger'
  id?: string
  children: React.ReactNode
}

export function SettingsSection({
  title,
  description,
  action,
  tone = 'default',
  id,
  children,
}: SettingsSectionProps) {
  const headingId = id ? `${id}-heading` : undefined

  return (
    <Card
      as="section"
      variant="outlined"
      padding="none"
      aria-labelledby={headingId}
      className={
        tone === 'danger'
          ? 'border-danger-default/40 bg-background-surface'
          : 'bg-background-surface'
      }
    >
      <div className="flex flex-col gap-3 border-b border-border-default px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <h2
            id={headingId}
            className={
              tone === 'danger'
                ? 'text-base font-semibold text-danger-default'
                : 'text-base font-semibold text-text-primary'
            }
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </Card>
  )
}

