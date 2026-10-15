import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoSettings } from '../contexts/DemoSettings'
import { useTextsStore } from '../contexts/TextsStore'
import { useToast } from '../contexts/ToastContext'
import { guessLanguage } from '../utils/languages'
import { translatePassage } from '../utils/mockAi'
import { firstLine, formatCount, textFromPairs } from '../utils/sentences'
import type { LanguageCode, SentencePair, Side, TextDoc } from '../types/texts'

export const MAX_CHARS = 20000

export type Phase = 'loading' | 'missing' | 'compose' | 'job' | 'preview' | 'read' | 'edit' | 'proposal'
export type JobKind = 'translate' | 'retranslate'
export type JobErrorKind = 'failure' | 'model-capacity' | 'no-credits' | 'ai-unavailable'
export type DetectState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'suggested'; lang: LanguageCode }
  | { status: 'low'; lang: LanguageCode }
  | { status: 'failed' }

interface Baseline {
  title: string
  sourceLang: LanguageCode | ''
  targetLang: LanguageCode | ''
  sourceText: string
}

const uid = () => `t-${Math.random().toString(36).slice(2, 9)}`

export function useWorkspace(folderId: string, textId?: string) {
  const navigate = useNavigate()
  const toast = useToast()
  const demo = useDemoSettings()
  const store = useTextsStore()
  const folder = store.folders.find((f) => f.id === folderId)
  const textsRef = useRef(store.texts)
  textsRef.current = store.texts

  const [phase, setPhase] = useState<Phase>(textId ? 'loading' : 'compose')
  const [docId, setDocId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [sourceLang, setSourceLang] = useState<LanguageCode | ''>('')
  const [targetLang, setTargetLang] = useState<LanguageCode | ''>('')
  const [sourceText, setSourceText] = useState('')
  const [baseline, setBaseline] = useState<Baseline>({ title: '', sourceLang: '', targetLang: '', sourceText: '' })
  const [pairs, setPairs] = useState<SentencePair[]>([])
  const [previewPairs, setPreviewPairs] = useState<SentencePair[] | null>(null)
  const [previewExpired, setPreviewExpired] = useState(false)
  const [job, setJob] = useState<{ kind: JobKind; stage: 'queued' | 'translating' } | null>(null)
  const [jobError, setJobError] = useState<{ kind: JobErrorKind; during: JobKind } | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showErrors, setShowErrors] = useState(false)
  const [detect, setDetect] = useState<DetectState>({ status: 'idle' })
  const [editBuffer, setEditBuffer] = useState<SentencePair[]>([])
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [conflict, setConflict] = useState<SentencePair[] | null>(null)
  const [mobileTab, setMobileTab] = useState<Side>('source')
  const [matchMode, setMatchMode] = useState(false)

  const timers = useRef<number[]>([])
  const translateAttempts = useRef(0)
  const saveAttempts = useRef(0)
  const detectAttempts = useRef(0)
  const doc = store.texts.find((t) => t.id === docId)

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  // Load an existing text (draft → compose, translated → read mode).
  useEffect(() => {
    if (!textId || textId === docId) return
    setPhase('loading')
    const t = window.setTimeout(() => {
      const d = textsRef.current.find((x) => x.id === textId && x.folderId === folderId)
      if (!d || d.archived) {
        setPhase('missing')
        return
      }
      setDocId(d.id)
      setTitle(d.title)
      setSourceLang(d.sourceLang)
      setTargetLang(d.targetLang)
      setSourceText(d.draftSource)
      setPairs(d.pairs)
      setBaseline({ title: d.title, sourceLang: d.sourceLang, targetLang: d.targetLang, sourceText: d.draftSource })
      setPhase(d.status === 'draft' ? 'compose' : 'read')
      setSaveState('idle')
    }, 450)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textId, folderId])

  // Validation
  const charCount = sourceText.length
  const errors = {
    sourceLang: !sourceLang ? 'Choose the source language.' : '',
    targetLang: !targetLang
      ? 'Choose the translation language.'
      : sourceLang === targetLang
        ? 'Choose a language different from the source.'
        : '',
    text: !sourceText.trim()
      ? 'Add some text to translate or save.'
      : charCount > MAX_CHARS
        ? `This text is ${formatCount(charCount - MAX_CHARS)} characters over the 20,000 limit. Shorten it to continue.`
        : '',
  }
  const isValid = !errors.sourceLang && !errors.targetLang && !errors.text

  const contentDirty =
    title !== baseline.title ||
    sourceLang !== baseline.sourceLang ||
    targetLang !== baseline.targetLang ||
    sourceText !== baseline.sourceText
  const unsaved =
    phase === 'preview' ||
    phase === 'proposal' ||
    (phase === 'edit' && touched.size > 0) ||
    ((phase === 'compose' || (phase === 'job' && job?.kind === 'translate')) && (contentDirty || !docId) && sourceText.trim().length > 0)

  useEffect(() => {
    if (!unsaved) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [unsaved])

  const goToRoute = (id: string) => {
    if (!textId) navigate(`/texts/folders/${folderId}/texts/${id}`, { replace: true })
  }

  const buildDoc = (patch: Partial<TextDoc>): TextDoc => ({
    id: docId ?? uid(),
    folderId,
    title: title.trim() || firstLine(sourceText),
    sourceLang: sourceLang as LanguageCode,
    targetLang: targetLang as LanguageCode,
    status: 'draft',
    draftSource: sourceText,
    pairs: [],
    archived: false,
    updatedAt: '',
    version: (doc?.version ?? 0) + 1,
    shareToken: doc?.shareToken ?? null,
    ...patch,
  })

  const commitBaseline = (d: TextDoc) => {
    setDocId(d.id)
    setTitle(d.title)
    setBaseline({ title: d.title, sourceLang: d.sourceLang, targetLang: d.targetLang, sourceText: d.draftSource })
  }

  // ---- Translation jobs -------------------------------------------------
  const startJob = (kind: JobKind, forceSuccess = false) => {
    if (kind === 'translate' && !isValid) {
      setShowErrors(true)
      return false
    }
    setJobError(null)
    setPreviewExpired(false)
    setJob({ kind, stage: 'queued' })
    setPhase('job')
    const text = kind === 'translate' ? sourceText : textFromPairs(pairs, 'source')
    const tgt = targetLang as LanguageCode
    timers.current.push(window.setTimeout(() => setJob({ kind, stage: 'translating' }), 1100))
    timers.current.push(
      window.setTimeout(() => {
        const outcome = forceSuccess || translateAttempts.current > 0 ? 'success' : demo.translateOutcome
        translateAttempts.current += 1
        setJob(null)
        if (outcome !== 'success' && outcome !== 'preview-expires') {
          setJobError({ kind: outcome, during: kind })
          setPhase(kind === 'translate' ? 'compose' : 'read')
          return
        }
        setPreviewPairs(translatePassage(text, tgt))
        setPreviewExpired(outcome === 'preview-expires')
        setPhase(kind === 'translate' ? 'preview' : 'proposal')
        setMobileTab('target')
      }, 3400),
    )
    return true
  }

  const cancelJob = () => {
    clearTimers()
    const kind = job?.kind
    setJob(null)
    setPhase(kind === 'retranslate' ? 'read' : 'compose')
    toast.push({
      variant: 'info',
      title: 'Translation cancelled',
      description: kind === 'retranslate' ? 'Your saved translation is unchanged.' : 'Your text is still here.',
    })
  }

  const discardPreview = () => {
    setPreviewPairs(null)
    setPreviewExpired(false)
    setPhase(previewPairs && phase === 'proposal' ? 'read' : 'compose')
    setMobileTab('source')
  }

  // ---- Saving -----------------------------------------------------------
  const saveDraft = (after?: () => void) => {
    if (errors.sourceLang || errors.targetLang || errors.text) {
      setShowErrors(true)
      return
    }
    setSaveState('saving')
    window.setTimeout(() => {
      const saved = store.saveText(buildDoc({ status: 'draft', pairs: [] }))
      commitBaseline(saved)
      setSaveState('saved')
      toast.push({ variant: 'success', title: 'Draft saved', description: `In ${folder?.name ?? 'this folder'}.` })
      goToRoute(saved.id)
      after?.()
    }, 700)
  }

  const saveTranslation = (after?: () => void) => {
    if (!previewPairs || previewExpired) return
    const proposal = phase === 'proposal'
    setSaveState('saving')
    window.setTimeout(() => {
      if (demo.saveOutcome === 'failure' && saveAttempts.current === 0) {
        saveAttempts.current += 1
        setSaveState('error')
        return
      }
      saveAttempts.current += 1
      const fresh = previewPairs.map((p) => ({ ...p, edited: false }))
      const saved = store.saveText(
        buildDoc({
          status: 'translated',
          pairs: fresh,
          draftSource: proposal ? textFromPairs(fresh, 'source') : sourceText,
          title: proposal ? doc?.title ?? title : title.trim() || firstLine(sourceText),
        }),
      )
      commitBaseline(saved)
      setPairs(fresh)
      setPreviewPairs(null)
      setPhase('read')
      setSaveState('saved')
      toast.push({
        variant: 'success',
        title: proposal ? 'New translation saved' : 'Translation saved',
        description: proposal ? 'It replaced the previous translation.' : `Saved to ${folder?.name ?? 'this folder'}.`,
      })
      goToRoute(saved.id)
      after?.()
    }, 800)
  }

  // ---- Pair editing -----------------------------------------------------
  const startEdit = () => {
    setEditBuffer(pairs.map((p) => ({ ...p })))
    setTouched(new Set())
    setConflict(null)
    setShowErrors(false)
    setSaveState('idle')
    setMatchMode(false)
    setPhase('edit')
  }

  const updatePair = (id: string, side: Side, value: string) => {
    setEditBuffer((prev) => prev.map((p) => (p.id === id ? { ...p, [side]: value } : p)))
    const original = pairs.find((p) => p.id === id)
    // Provenance is sticky: typing the original wording back does not clear it.
    if (original && original[side] !== value) setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  const cancelEdit = () => {
    setEditBuffer([])
    setTouched(new Set())
    setConflict(null)
    setSaveState('idle')
    setPhase('read')
  }

  const emptyPairIds = editBuffer.filter((p) => !p.source.trim() || !p.target.trim()).map((p) => p.id)

  const remoteVersion = (): SentencePair[] =>
    pairs.map((p, i) =>
      i === Math.min(1, pairs.length - 1)
        ? {
            ...p,
            edited: true,
            target: p.target.includes('orilla') ? p.target.replace('orilla', 'ribera') : p.target.replace(/([.!?»”]*)$/, ' (revisado)$1'),
          }
        : p,
    )

  const saveChanges = (force = false, after?: () => void) => {
    if (!doc) return
    if (emptyPairIds.length) {
      setShowErrors(true)
      return
    }
    setSaveState('saving')
    window.setTimeout(() => {
      if (!force && saveAttempts.current === 0 && demo.saveOutcome !== 'success') {
        saveAttempts.current += 1
        setSaveState('error')
        if (demo.saveOutcome === 'conflict') setConflict(remoteVersion())
        return
      }
      saveAttempts.current += 1
      const next = editBuffer.map((p) => ({ ...p, edited: p.edited || touched.has(p.id) }))
      const anyEdited = next.some((p) => p.edited)
      store.saveText({ ...doc, pairs: next, draftSource: textFromPairs(next, 'source'), status: anyEdited ? 'edited' : doc.status, version: doc.version + 1 })
      const changed = touched.size
      setPairs(next)
      setConflict(null)
      setTouched(new Set())
      setPhase('read')
      setSaveState('saved')
      toast.push({
        variant: 'success',
        title: 'Changes saved',
        description: changed ? `${changed} sentence ${changed === 1 ? 'pair is' : 'pairs are'} marked “Edited after translation”.` : undefined,
      })
      after?.()
    }, 800)
  }

  const reloadRemote = () => {
    if (!doc || !conflict) return
    store.saveText({ ...doc, pairs: conflict, status: 'edited', version: doc.version + 1 })
    setPairs(conflict)
    setConflict(null)
    setTouched(new Set())
    setPhase('read')
    setSaveState('saved')
    toast.push({ variant: 'info', title: 'Loaded the newer version', description: 'Your unsaved edits were discarded.' })
  }

  // ---- Detection (advisory only) ----------------------------------------
  const runDetect = () => {
    if (!sourceText.trim()) return
    setDetect({ status: 'detecting' })
    timers.current.push(
      window.setTimeout(() => {
        const outcome = detectAttempts.current > 0 && demo.detectOutcome === 'failure' ? 'confident' : demo.detectOutcome
        detectAttempts.current += 1
        const lang = guessLanguage(sourceText)
        if (outcome === 'failure') setDetect({ status: 'failed' })
        else if (outcome === 'low-confidence') setDetect({ status: 'low', lang })
        else setDetect({ status: 'suggested', lang })
      }, 1200),
    )
  }

  const acceptDetected = () => {
    if (detect.status === 'suggested' || detect.status === 'low') setSourceLang(detect.lang)
    setDetect({ status: 'idle' })
  }

  const rename = useCallback(
    (next: string) => {
      if (!docId) return
      store.updateTextTitle(docId, next)
      setTitle(next)
      setBaseline((b) => ({ ...b, title: next }))
    },
    [docId, store],
  )

  const unsavedLabel = useMemo(() => {
    if (saveState === 'saving') return 'Saving…'
    if (saveState === 'error') return 'Not saved'
    if (phase === 'preview' || phase === 'proposal') return 'Not saved yet'
    if (unsaved) return 'Unsaved changes'
    if (docId) return 'Saved'
    return 'Not saved yet'
  }, [saveState, phase, unsaved, docId])

  return {
    folder, doc, phase, title, setTitle, sourceLang, setSourceLang, targetLang, setTargetLang, sourceText, setSourceText,
    pairs, previewPairs, previewExpired, job, jobError, setJobError, saveState, showErrors, errors, isValid, charCount,
    detect, setDetect, runDetect, acceptDetected, editBuffer, touched, emptyPairIds, conflict, mobileTab, setMobileTab,
    matchMode, setMatchMode, unsaved, unsavedLabel, startJob, cancelJob, discardPreview, saveDraft, saveTranslation,
    startEdit, updatePair, cancelEdit, saveChanges, reloadRemote, rename,
  }
}

export type WorkspaceController = ReturnType<typeof useWorkspace>
