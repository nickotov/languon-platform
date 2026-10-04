import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GraduationCapIcon, HistoryIcon, LayersIcon, MessageSquareTextIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../DropdownMenu'
import { Dialog, DialogActions } from '../Dialog'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { ResponsiveSheet } from '../card/ResponsiveSheet'
import { PracticeSetup } from './PracticeSetup'
import { PracticeFrame } from './PracticeFrame'
import { PracticeBody } from './PracticeBody'
import { PracticeActions } from './PracticeActions'
import { ProgressStrip } from './ProgressStrip'
import { SessionSummary } from './SessionSummary'
import { HistoryContent } from './HistoryContent'
import { useApp } from '../../contexts/AppContext'
import { usePractice } from '../../contexts/PracticeContext'
import { usePracticeSession } from '../../hooks/usePracticeSession'
import { useIsCompact } from '../../hooks/useMediaQuery'
import type { Dictionary } from '../../types/dictionary'
import type { PracticeConfig, Presentation } from '../../types/practice'

interface PracticeLauncherProps {
  dictionary: Dictionary
}

/** Dictionary learning menu (Flashcards + Sentence practice) and the practice session it opens. */
export function PracticeLauncher({ dictionary }: PracticeLauncherProps) {
  const { cardsFor, pushToast } = useApp()
  const practice = usePractice()
  const compact = useIsCompact()
  const triggerRef = useRef<HTMLSpanElement>(null)

  const [setupOpen, setSetupOpen] = useState(false)
  const [config, setConfig] = useState<PracticeConfig | null>(null)
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [presentation, setPresentation] = useState<Presentation>('fullscreen')
  const [view, setView] = useState<'practice' | 'summary'>('practice')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [fsNotice, setFsNotice] = useState<'unavailable' | 'exited' | null>(null)

  const session = usePracticeSession(config)
  const entries = cardsFor(dictionary.id)
  const archived = dictionary.status === 'archived'

  const restoreFocus = useCallback(() => {
    window.setTimeout(() => triggerRef.current?.querySelector<HTMLElement>('button')?.focus(), 0)
  }, [])

  const exitNative = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined)
  }

  // Native full-screen exit (Escape or browser UI) keeps the session and the viewport layout.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && practiceOpen && presentation === 'fullscreen') setFsNotice('exited')
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [practiceOpen, presentation])

  // Escape in the viewport layout changes presentation only; it never ends practice.
  useEffect(() => {
    if (!practiceOpen || presentation !== 'fullscreen' || compact) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.fullscreenElement) return
      if (confirmLeave || historyOpen || prefsOpen) return
      setPresentation('dialog')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compact, confirmLeave, historyOpen, practiceOpen, prefsOpen, presentation])

  const enterFullscreen = () => {
    if (compact) return
    const api = document.documentElement.requestFullscreen
    if (practice.scenario.fullscreenApi === 'unavailable' || !api) {
      setFsNotice('unavailable')
      return
    }
    setFsNotice(null)
    document.documentElement.requestFullscreen().catch(() => setFsNotice('unavailable'))
  }

  const start = (next: PracticeConfig, chosen: Presentation) => {
    if (chosen === 'fullscreen') enterFullscreen() // within the user's gesture
    else setFsNotice(null)
    setPresentation(chosen)
    setConfig({ ...next })
    setView('practice')
    setSetupOpen(false)
    setPracticeOpen(true)
  }

  const togglePresentation = () => {
    if (presentation === 'fullscreen') {
      exitNative()
      setFsNotice(null)
      setPresentation('dialog')
    } else {
      enterFullscreen()
      setPresentation('fullscreen')
    }
  }

  const unsentDraft =
    session.draft.trim().length > 0 && session.draft !== session.submitted
  const needsConfirm = session.busy || unsentDraft

  const leave = () => {
    exitNative()
    setConfirmLeave(false)
    setPracticeOpen(false)
    setFsNotice(null)
    restoreFocus()
  }

  const requestClose = () => (needsConfirm ? setConfirmLeave(true) : leave())

  const hasSaved = useMemo(
    () =>
      config
        ? practice
            .savedPoolFor(dictionary.id)
            .some((item) => item.direction === config.direction && item.status === 'current')
        : false,
    [config, dictionary.id, practice],
  )

  const coverage = useMemo(() => {
    const ids = config?.entryIds ?? []
    return { eligible: ids.length, seen: ids.filter((id) => practice.seenEntryIds.includes(id)).length }
  }, [config, practice.seenEntryIds])

  const signIn = () => {
    practice.setViewer('reader')
    pushToast({ title: 'Signed in', description: `Back on “${dictionary.name}”.`, variant: 'success' })
  }

  const notice =
    fsNotice === 'unavailable' ? (
      <InlineAlert tone="info" onDismiss={() => setFsNotice(null)} title="Browser full screen isn’t available">
        Practice fills this window instead. Everything works the same.
      </InlineAlert>
    ) : fsNotice === 'exited' ? (
      <InlineAlert tone="info" onDismiss={() => setFsNotice(null)} title="Browser full screen ended">
        Your practice continues here — nothing was reset. Use Close to end practice.
      </InlineAlert>
    ) : null

  return (
    <>
      <span ref={triggerRef} className="inline-flex">
        <DropdownMenu
          align="end"
          menuClassName="bg-background-elevated text-text-primary border-border-default"
          trigger={
            <DropdownMenuTrigger className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-background-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-background-subtle">
              <GraduationCapIcon aria-hidden className="h-4 w-4" />
              Learn
            </DropdownMenuTrigger>
          }
        >
          <DropdownMenuLabel>Practise this dictionary</DropdownMenuLabel>
          <DropdownMenuItem
            icon={<LayersIcon aria-hidden className="h-4 w-4" />}
            disabled
            title="Existing flashcard practice — outside this prototype"
          >
            Flashcards
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<MessageSquareTextIcon aria-hidden className="h-4 w-4" />}
            disabled={archived}
            onSelect={() => setSetupOpen(true)}
          >
            Sentence practice
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            icon={<HistoryIcon aria-hidden className="h-4 w-4" />}
            disabled={practice.viewer === 'anonymous'}
            onSelect={() => setHistoryOpen(true)}
          >
            My practice history
          </DropdownMenuItem>
        </DropdownMenu>
      </span>

      {setupOpen ? (
        <PracticeSetup
          frame="sheet"
          open
          dictionary={dictionary}
          entries={entries}
          viewer={practice.viewer}
          onClose={() => {
            setSetupOpen(false)
            restoreFocus()
          }}
          onStart={start}
          onSignIn={signIn}
        />
      ) : null}

      {practiceOpen && config ? (
        <PracticeFrame
          presentation={presentation}
          compact={compact}
          title={dictionary.name}
          progress={<ProgressStrip counters={session.counters} coverage={coverage} />}
          notice={notice}
          body={
            view === 'summary' ? (
              <SessionSummary
                counters={session.counters}
                coverage={coverage}
                onBack={() => setView('practice')}
                onLeave={requestClose}
                onOpenHistory={() => setHistoryOpen(true)}
              />
            ) : (
              <PracticeBody
                session={session}
                hasSavedSentences={hasSaved}
                onReturn={requestClose}
                onOpenPreferences={() => setPrefsOpen(true)}
                onSignIn={signIn}
              />
            )
          }
          footer={view === 'practice' ? <PracticeActions session={session} /> : undefined}
          onTogglePresentation={togglePresentation}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenSummary={() => setView((prev) => (prev === 'summary' ? 'practice' : 'summary'))}
          onRequestClose={requestClose}
        />
      ) : null}

      {historyOpen ? (
        <ResponsiveSheet
          open
          size="lg"
          title="My practice history"
          description={dictionary.name}
          onClose={() => setHistoryOpen(false)}
        >
          <HistoryContent dictionaryId={dictionary.id} />
        </ResponsiveSheet>
      ) : null}

      {prefsOpen ? (
        <ResponsiveSheet
          open
          size="sm"
          title="AI preferences"
          description="Your profile settings"
          onClose={() => setPrefsOpen(false)}
          footer={
            <div className="flex justify-end">
              <Button onClick={() => setPrefsOpen(false)}>Back to practice</Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Your existing AI preferences screen opens here, on top of practice, so your
              sentence and draft stay as they are.
            </p>
            <p>
              A different model choice applies to future requests. Work that is already running
              keeps the model it started with.
            </p>
          </div>
        </ResponsiveSheet>
      ) : null}

      <Dialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        size="sm"
        title="Leave practice?"
        className="bg-background-surface text-text-primary"
        footer={
          <DialogActions>
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
              Keep practising
            </Button>
            <Button onClick={leave}>Leave practice</Button>
          </DialogActions>
        }
      >
        <div className="space-y-2 text-sm text-text-secondary">
          {unsentDraft ? <p>Your unsent translation will be discarded.</p> : null}
          {session.busy ? (
            <p>
              {session.job.kind === 'check'
                ? 'Your AI check is still running.'
                : 'A new sentence is still being prepared.'}{' '}
              Leaving doesn’t cancel it or refund credits. If it finishes, the result is saved to
              your personal practice.
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}

