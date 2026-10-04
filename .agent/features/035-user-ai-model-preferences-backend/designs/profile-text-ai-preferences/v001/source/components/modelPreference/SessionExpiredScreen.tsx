import React, { useId, useState } from 'react'
import { LockKeyholeIcon, LogInIcon } from 'lucide-react'
import { Button } from '../Button'
import { Card } from '../Card'

interface SessionExpiredScreenProps {
  onSignIn: () => void
}

/** Replaces all protected profile content when the session has ended. */
export function SessionExpiredScreen({ onSignIn }: SessionExpiredScreenProps) {
  const [busy, setBusy] = useState(false)
  const titleId = `session-expired-${useId().replace(/:/g, '')}`

  return (
    <Card
      as="section"
      variant="outlined"
      padding="none"
      aria-labelledby={titleId}
      className="mx-auto max-w-reading bg-background-surface px-4 py-8 sm:px-8 sm:py-10"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="radius-full flex h-12 w-12 items-center justify-center bg-primary-subtle text-primary-default">
          <LockKeyholeIcon aria-hidden="true" className="h-6 w-6" />
        </span>
        <div>
          <h2
            id={titleId}
            className="text-lg font-semibold text-text-primary"
          >
            Your session has ended
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Sign in again to see your profile. We’ve hidden your account details
            to keep them private. Unsaved changes on this page weren’t kept.
          </p>
        </div>
        <Button
          loading={busy}
          leadingIcon={<LogInIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() => {
            setBusy(true)
            window.setTimeout(() => {
              setBusy(false)
              onSignIn()
            }, 900)
          }}
        >
          Sign in again
        </Button>
      </div>
    </Card>
  )
}

