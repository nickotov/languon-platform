import React, { useEffect, useState } from 'react'
import { MailIcon } from 'lucide-react'
import { Button } from '../Button'
import { Dialog } from '../Dialog'

interface SignInDialogProps {
  open: boolean
  reason: string
  onClose: () => void
  onSignedIn: () => void
}

export function SignInDialog({ open, reason, onClose, onSignedIn }: SignInDialogProps) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setBusy(false)
  }, [open])

  const signIn = () => {
    setBusy(true)
    window.setTimeout(() => {
      setBusy(false)
      onSignedIn()
    }, 900)
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="sm"
      title="Sign in to continue"
      description={`${reason} You’ll come right back to this page.`}
      dismissOnOverlayClick={!busy}
    >
      <div className="space-y-2">
        <Button fullWidth loading={busy} onClick={signIn} leadingIcon={<MailIcon className="h-4 w-4" />}>
          Continue with email
        </Button>
        <Button fullWidth variant="ghost" onClick={onClose} disabled={busy}>
          Keep reading
        </Button>
        <p className="pt-2 text-center text-xs text-text-tertiary">New to Languon? Signing in creates a free account.</p>
      </div>
    </Dialog>
  )
}
