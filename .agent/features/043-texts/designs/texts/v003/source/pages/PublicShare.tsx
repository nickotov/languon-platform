import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, ArrowRightIcon, CopyIcon } from 'lucide-react'
import { Button } from '../components/Button'
import { Skeleton } from '../components/Skeleton'
import { Switch } from '../components/Switch'
import { CopyDialog } from '../components/public/CopyDialog'
import { PublicFolderView } from '../components/public/PublicFolderView'
import { PublicHeader } from '../components/public/PublicHeader'
import { SignInDialog } from '../components/public/SignInDialog'
import { UnavailableState } from '../components/public/UnavailableState'
import { CollectableReading } from '../components/vocab/CollectableReading'
import { useDemoSettings } from '../contexts/DemoSettings'
import { useTextsStore } from '../contexts/TextsStore'
import { useToast } from '../contexts/ToastContext'
import { useIsCompact } from '../hooks/useMediaQuery'
import { languageName } from '../utils/languages'
import type { Side, TextDoc } from '../types/texts'

interface CopyRequest {
  mode: 'text' | 'folder'
  texts: TextDoc[]
  total: number
  defaultName: string
}

export function PublicShare() {
  const { token = '', textId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const demo = useDemoSettings()
  const { resolveShare } = useTextsStore()
  const compact = useIsCompact()
  const [signedIn, setSignedIn] = useState(demo.visitorSignedIn)
  const [loading, setLoading] = useState(true)
  const [matchMode, setMatchMode] = useState(false)
  const [tab, setTab] = useState<Side>('source')
  const [copy, setCopy] = useState<CopyRequest | null>(null)
  const [pending, setPending] = useState<{ reason: string; action: () => void } | null>(null)

  useEffect(() => setSignedIn(demo.visitorSignedIn), [demo.visitorSignedIn])
  useEffect(() => {
    setLoading(true)
    const t = window.setTimeout(() => setLoading(false), 500)
    return () => window.clearTimeout(t)
  }, [token, textId])

  const res = resolveShare(token)

  const requireAuth = (reason: string, action: () => void) => {
    if (signedIn) action()
    else setPending({ reason, action })
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-background-canvas">
        <PublicHeader signedIn={signedIn} onSignIn={() => undefined} />
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-10 sm:px-6" aria-label="Loading shared page">
          <Skeleton width="50%" height={28} />
          <Skeleton lines={6} />
        </div>
      </div>
    )
  }

  let text: TextDoc | undefined
  if (res.kind === 'text') text = res.text
  if (res.kind === 'folder' && textId) {
    text = res.texts.find((t) => t.id === textId)
    if (!text) return <UnavailableState />
  }
  if (res.kind === 'unavailable') return <UnavailableState />

  const openCopy = (req: CopyRequest) =>
    requireAuth(req.mode === 'folder' ? 'Copying a folder needs an account.' : 'Copying a text needs an account.', () => setCopy(req))

  const dialogs = (
    <>
      <SignInDialog
        open={Boolean(pending)}
        reason={pending?.reason ?? ''}
        onClose={() => setPending(null)}
        onSignedIn={() => {
          setSignedIn(true)
          const action = pending?.action
          setPending(null)
          toast.push({ variant: 'success', title: 'Signed in', description: 'Picking up where you left off.' })
          action?.()
        }}
      />
      {copy && (
        <CopyDialog
          open
          mode={copy.mode}
          texts={copy.texts}
          total={copy.total}
          defaultName={copy.defaultName}
          onClose={() => setCopy(null)}
          onDone={(folder, count) => {
            setCopy(null)
            toast.push({
              variant: 'success',
              title: count > 1 ? `Copied ${count} texts to ${folder.name}` : `Copied to ${folder.name}`,
              description: 'Your copy is independent of the shared original.',
              action: { label: 'Open folder', onClick: () => navigate(`/texts/folders/${folder.id}`) },
            })
          }}
        />
      )}
    </>
  )

  if (res.kind === 'folder' && !text) {
    return (
      <div className="min-h-screen w-full bg-background-canvas">
        <PublicHeader signedIn={signedIn} onSignIn={() => requireAuth('Sign in to save words and copies.', () => undefined)} />
        <PublicFolderView
          token={token}
          folder={res.folder}
          texts={res.texts}
          total={res.totalTranslated}
          onCopyFolder={() => openCopy({ mode: 'folder', texts: res.texts, total: res.totalTranslated, defaultName: `${res.folder.name} (copy)` })}
          onCopyText={(t) => openCopy({ mode: 'text', texts: [t], total: 1, defaultName: res.folder.name })}
        />
        {dialogs}
      </div>
    )
  }

  if (!text) return <UnavailableState />
  const t = text

  return (
    <div className="workspace-viewport flex w-full flex-col bg-background-canvas">
      <PublicHeader signedIn={signedIn} onSignIn={() => requireAuth('Sign in to save words and copies.', () => undefined)} />
      <div className="shrink-0 border-b border-border-default bg-background-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            {res.kind === 'folder' && (
              <Link to={`/share/${token}`} className="inline-flex min-h-8 items-center gap-1 rounded-md text-xs font-medium text-primary-default hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus">
                <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden /> {res.folder.name}
              </Link>
            )}
            <h1 className="break-words text-lg font-semibold text-text-primary sm:text-xl">{t.title}</h1>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-secondary">
              {languageName(t.sourceLang)} <ArrowRightIcon className="h-3 w-3" aria-label="to" /> {languageName(t.targetLang)} · Anyone with the link can read
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Switch size="sm" label={matchMode ? 'Match sentences · On' : 'Match sentences'} checked={matchMode} onCheckedChange={setMatchMode} />
            <Button
              variant="secondary"
              size="compact"
              leadingIcon={<CopyIcon className="h-4 w-4" />}
              onClick={() => openCopy({ mode: 'text', texts: [t], total: 1, defaultName: 'Shared texts' })}
            >
              Copy to my folders
            </Button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <CollectableReading
          pairs={t.pairs}
          sourceLang={t.sourceLang}
          targetLang={t.targetLang}
          matchMode={matchMode}
          compact={compact}
          tab={tab}
          onTabChange={setTab}
          showEditedMarkers={false}
          requireSignIn={!signedIn}
          onSignIn={() => setSignedIn(true)}
          topSlot={
            !signedIn ? (
              <p className="rounded-xl border border-border-default bg-background-surface px-4 py-3 text-sm leading-6 text-text-secondary">
                Select any word to save it with its meaning here. Saving words or copying needs a free account.
              </p>
            ) : undefined
          }
        />
      </div>
      {dialogs}
    </div>
  )
}
