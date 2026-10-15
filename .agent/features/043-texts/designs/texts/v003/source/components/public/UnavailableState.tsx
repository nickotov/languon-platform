import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2OffIcon } from 'lucide-react'
import { Button } from '../Button'
import { Logo } from '../Logo'

/** Same calm page for revoked, archived, missing or unavailable sources — no owner details. */
export function UnavailableState() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen w-full flex-col bg-background-canvas">
      <header className="flex h-16 items-center border-b border-border-default bg-background-surface px-4 sm:px-6">
        <Logo variant="lockup" size="sm" href="/texts" />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border-default bg-background-surface p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-background-subtle text-text-secondary" aria-hidden>
            <Link2OffIcon className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">This shared page isn’t available</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            The link may have been turned off, or the content is no longer shared. If someone sent it to you, ask them for a new link.
          </p>
          <Button className="mt-6" onClick={() => navigate('/texts')}>
            Go to Languon
          </Button>
        </div>
      </main>
    </div>
  )
}
