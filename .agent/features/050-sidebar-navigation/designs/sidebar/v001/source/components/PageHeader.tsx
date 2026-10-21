import React from 'react'

type PageHeaderProps = {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-text-secondary">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

