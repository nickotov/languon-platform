import React from 'react'
import { GlobeIcon, LogInIcon } from 'lucide-react'
import { Avatar } from '../Avatar'
import { Button } from '../Button'
import { Logo } from '../Logo'

interface PublicHeaderProps {
  signedIn: boolean
  onSignIn: () => void
}

export function PublicHeader({ signedIn, onSignIn }: PublicHeaderProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border-default bg-background-surface px-4 sm:px-6">
      <Logo variant="lockup" size="sm" href="/texts" />
      <span className="hidden items-center gap-1 text-xs text-text-tertiary sm:inline-flex">
        <GlobeIcon className="h-3.5 w-3.5" aria-hidden />
        Shared · read only
      </span>
      <div className="ml-auto flex items-center gap-2">
        {signedIn ? (
          <span className="flex items-center gap-2 text-sm text-text-secondary">
            <Avatar name="Alex Kim" size="sm" />
            <span className="hidden sm:inline">Signed in</span>
          </span>
        ) : (
          <Button variant="secondary" size="compact" onClick={onSignIn} leadingIcon={<LogInIcon className="h-4 w-4" />}>
            Sign in
          </Button>
        )}
      </div>
    </header>
  )
}
