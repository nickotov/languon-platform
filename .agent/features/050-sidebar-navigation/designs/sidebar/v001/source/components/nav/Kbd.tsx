import React from 'react'

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-default bg-background-subtle px-1 font-sans text-xs font-medium text-text-tertiary">
      {children}
    </kbd>
  )
}

