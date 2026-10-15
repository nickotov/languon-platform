import React from 'react'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-background-surface px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-subtle text-primary-default" aria-hidden>
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-text-secondary">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
