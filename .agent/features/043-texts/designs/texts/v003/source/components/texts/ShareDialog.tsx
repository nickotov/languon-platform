import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckIcon, CopyIcon, ExternalLinkIcon, GlobeIcon, Link2Icon, RefreshCwIcon } from 'lucide-react'
import { Button } from '../Button'
import { Dialog, DialogActions } from '../Dialog'
import { InlineAlert } from '../InlineAlert'
import { useTextsStore } from '../../contexts/TextsStore'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  kind: 'text' | 'folder'
  id: string
  name: string
  shareToken: string | null
}

type Step = 'idle' | 'creating' | 'active' | 'confirm-revoke' | 'revoking' | 'revoked'

export function ShareDialog({ open, onClose, kind, id, name, shareToken }: ShareDialogProps) {
  const { createShareLink, revokeShareLink } = useTextsStore()
  const [step, setStep] = useState<Step>(shareToken ? 'active' : 'idle')
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStep(shareToken ? 'active' : 'idle')
      setCopied(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const [lastToken, setLastToken] = useState<string | null>(shareToken)
  useEffect(() => {
    if (shareToken) setLastToken(shareToken)
  }, [shareToken])

  const url = shareToken ? `https://languon.app/share/${shareToken}` : ''
  const busy = step === 'creating' || step === 'revoking'

  const create = () => {
    setStep('creating')
    window.setTimeout(() => {
      createShareLink(kind, id)
      setStep('active')
    }, 700)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      inputRef.current?.select()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }

  const revoke = () => {
    setStep('revoking')
    window.setTimeout(() => {
      revokeShareLink(kind, id)
      setStep('revoked')
    }, 700)
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={kind === 'folder' ? 'Share folder' : 'Share text'}
      description={name}
      dismissOnOverlayClick={!busy}
      footer={
        <DialogActions align="between">
          {step === 'active' ? (
            <Button variant="ghost" onClick={() => setStep('confirm-revoke')} className="text-danger-default">
              Revoke link
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Done
          </Button>
        </DialogActions>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-3 rounded-xl border border-border-default bg-background-subtle p-4">
          <GlobeIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden />
          <div className="min-w-0 text-sm leading-6">
            <p className="font-medium text-text-primary">Anyone with the link can read</p>
            <p className="text-text-secondary">
              The link isn’t listed or searchable, and visitors can’t edit. Signed-in visitors can save words and make
              their own independent copy.
            </p>
          </div>
        </div>

        <p className="text-sm leading-6 text-text-secondary">
          {kind === 'folder'
            ? 'This is a live folder: newly saved translated texts and later edits appear automatically. Drafts and archived texts are never shared.'
            : 'Changes you save later appear on the shared page. Archiving the text turns the link off.'}
        </p>

        {(step === 'idle' || step === 'creating') && (
          <Button onClick={create} loading={step === 'creating'} leadingIcon={<Link2Icon className="h-4 w-4" />}>
            Create link
          </Button>
        )}

        {(step === 'active' || step === 'confirm-revoke' || step === 'revoking') && shareToken && (
          <div className="space-y-3">
            <label htmlFor="share-url" className="text-sm font-medium text-text-primary">
              Unlisted link
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="share-url"
                ref={inputRef}
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 min-w-0 flex-1 rounded-xl border border-border-default bg-background-surface px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
              />
              <Button
                variant="secondary"
                onClick={copy}
                leadingIcon={copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className="sr-only" aria-live="polite">
              {copied ? 'Link copied to clipboard' : ''}
            </p>
            <Link
              to={`/share/${shareToken}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-primary-default hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
            >
              <ExternalLinkIcon className="h-4 w-4" aria-hidden />
              Preview public page
            </Link>
          </div>
        )}

        {(step === 'confirm-revoke' || step === 'revoking') && (
          <InlineAlert
            tone="warning"
            title="Revoke this link?"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" size="compact" loading={step === 'revoking'} onClick={revoke}>
                  Revoke link
                </Button>
                <Button variant="secondary" size="compact" disabled={step === 'revoking'} onClick={() => setStep('active')}>
                  Keep link
                </Button>
              </div>
            }
          >
            Anyone who opens it will see that it’s unavailable. You can create a new link later, but this one won’t work
            again. Copies people already saved are not affected.
          </InlineAlert>
        )}

        {step === 'revoked' && (
          <InlineAlert
            tone="success"
            title="Link revoked"
            actions={
              <Button variant="secondary" size="compact" onClick={create} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
                Create a new link
              </Button>
            }
          >
            The old link now shows an unavailable page. This {kind} is private again.
            {lastToken && (
              <>
                {' '}
                <Link to={`/share/${lastToken}`} className="font-medium text-primary-default underline underline-offset-2">
                  See what visitors see
                </Link>
              </>
            )}
          </InlineAlert>
        )}
      </div>
    </Dialog>
  )
}
