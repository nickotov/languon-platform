import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoSettings } from '../contexts/DemoSettings'
import { useTextsStore } from '../contexts/TextsStore'
import { useToast } from '../contexts/ToastContext'
import { generateCard } from '../utils/mockAi'
import type { Card, LanguageCode, SelectionInfo, SentencePair, TextMark } from '../types/texts'

export type CollectStep = 'closed' | 'trigger' | 'invalid' | 'loading' | 'pick' | 'new' | 'duplicate' | 'signin'

export interface CollectOptions {
  pairs: SentencePair[]
  sourceLang: LanguageCode
  targetLang: LanguageCode
  requireSignIn?: boolean
  onSignIn?: () => void
  previewExpired?: boolean
}

interface State {
  step: CollectStep
  selection: SelectionInfo | null
  duplicate: { card: Card; dictionaryId: string } | null
}

const PANEL_STEPS: CollectStep[] = ['loading', 'pick', 'new', 'duplicate', 'signin']

export function useCollect({ pairs, sourceLang, targetLang, requireSignIn, onSignIn, previewExpired }: CollectOptions) {
  const navigate = useNavigate()
  const toast = useToast()
  const demo = useDemoSettings()
  const { dictionaries, cards, addCard, createDictionaryWithCard } = useTextsStore()
  const [state, setState] = useState<State>({ step: 'closed', selection: null, duplicate: null })
  const [inflight, setInflight] = useState<Record<string, TextMark>>({})
  const inflightRef = useRef<Record<string, TextMark>>({})
  const attemptsRef = useRef(0)
  const [signingIn, setSigningIn] = useState(false)

  const { step, selection } = state

  const onSelection = useCallback((info: SelectionInfo | null) => {
    setState((prev) => {
      if (PANEL_STEPS.includes(prev.step)) return prev
      if (!info) return prev.step === 'closed' ? prev : { ...prev, step: 'closed', selection: null }
      return { ...prev, step: info.kind === 'valid' ? 'trigger' : 'invalid', selection: info }
    })
  }, [])

  const direction = useMemo<[LanguageCode, LanguageCode]>(
    () => (selection?.side === 'target' ? [targetLang, sourceLang] : [sourceLang, targetLang]),
    [selection?.side, sourceLang, targetLang],
  )

  const compatible = useMemo(
    () => dictionaries.filter((d) => d.sourceLang === direction[0] && d.targetLang === direction[1]),
    [dictionaries, direction],
  )

  const setStep = (s: CollectStep) => setState((prev) => ({ ...prev, step: s }))

  const showPicker = useCallback(() => {
    setState((prev) => ({ ...prev, step: 'loading', duplicate: null }))
    window.setTimeout(() => setState((prev) => (prev.step === 'loading' ? { ...prev, step: 'pick' } : prev)), 450)
  }, [])

  const open = useCallback(() => {
    if (requireSignIn) setStep('signin')
    else showPicker()
  }, [requireSignIn, showPicker])

  const close = useCallback(() => setState({ step: 'closed', selection: null, duplicate: null }), [])

  const signIn = useCallback(() => {
    setSigningIn(true)
    window.setTimeout(() => {
      setSigningIn(false)
      onSignIn?.()
      showPicker()
    }, 900)
  }, [onSignIn, showPicker])

  const contextFor = (sel: SelectionInfo) => {
    const i = pairs.findIndex((p) => p.id === sel.pairId)
    const text = (p?: SentencePair) => (p ? (sel.side === 'source' ? p.source : p.target) : '')
    return [text(pairs[i - 1]), text(pairs[i]), text(pairs[i + 1])].filter(Boolean).join(' ')
  }

  const release = (key: string) => {
    delete inflightRef.current[key]
    setInflight({ ...inflightRef.current })
  }

  const submit = (target: { dictionaryId?: string; newName?: string }, allowDuplicate = false) => {
    const sel = selection
    if (!sel || sel.kind !== 'valid' || sel.pairId === undefined || sel.side === undefined) return
    const term = sel.text
    const [from, to] = direction
    if (target.dictionaryId && !allowDuplicate) {
      const existing = cards.find(
        (c) => c.dictionaryId === target.dictionaryId && c.term.toLowerCase() === term.toLowerCase(),
      )
      if (existing) {
        setState((prev) => ({ ...prev, step: 'duplicate', duplicate: { card: existing, dictionaryId: target.dictionaryId! } }))
        return
      }
    }
    const occurrence: TextMark = {
      pairId: sel.pairId, side: sel.side, sentenceIndex: sel.sentenceIndex ?? 0, start: sel.start ?? 0, end: sel.end ?? 0, state: 'adding',
    }
    const key = `${sel.pairId}|${sel.side}|${occurrence.sentenceIndex}|${occurrence.start}->${target.dictionaryId ?? `new:${target.newName}`}`
    if (inflightRef.current[key]) return
    close()

    const dictName = target.dictionaryId ? dictionaries.find((d) => d.id === target.dictionaryId)?.name ?? 'dictionary' : target.newName ?? ''
    if (previewExpired) {
      toast.push({
        variant: 'error',
        title: 'This translation preview expired',
        description: `“${term}” wasn’t added. Regenerate the translation, then try again.`,
      })
      return
    }

    inflightRef.current[key] = occurrence
    setInflight({ ...inflightRef.current })
    const context = contextFor(sel)
    const toastId = toast.push({
      variant: 'loading',
      title: `Adding “${term}”…`,
      description: `To ${dictName}. You can keep reading.`,
    })

    const succeed = (note?: string) => {
      const generated = generateCard(term, from, to, context, sel.sentence ?? '')
      const cardInput = { ...generated, context: sel.sentence ?? '', fromText: true }
      let destId = target.dictionaryId ?? ''
      let destName = dictName
      if (target.newName) {
        const { dictionary } = createDictionaryWithCard({ name: target.newName, sourceLang: from, targetLang: to, hiddenFields: [] }, cardInput)
        destId = dictionary.id
        destName = dictionary.name
      } else {
        addCard(destId, cardInput)
      }
      release(key)
      toast.update(toastId, {
        variant: 'success',
        title: `Added “${term}” to ${destName}`,
        description: note ?? `${generated.translation} — with definition and example.`,
        action: { label: 'Open dictionary', onClick: () => navigate(`/dictionaries/${destId}`) },
      })
    }

    const run = () => {
      const outcome = attemptsRef.current === 0 ? demo.collectOutcome : 'success'
      attemptsRef.current += 1
      window.setTimeout(() => {
        if (outcome === 'success') return succeed()
        if (outcome === 'network-uncertain') {
          toast.update(toastId, {
            variant: 'loading',
            title: `Checking whether “${term}” was added…`,
            description: 'The connection dropped. We’re confirming the result — no need to add it again.',
          })
          window.setTimeout(() => succeed('Confirmed — it was added once.'), 2400)
          return
        }
        release(key)
        const retry = () => {
          inflightRef.current[key] = occurrence
          setInflight({ ...inflightRef.current })
          toast.update(toastId, { variant: 'loading', title: `Adding “${term}”…`, description: `To ${dictName}. You can keep reading.` })
          run()
        }
        const noDict = target.newName ? ' No dictionary was created.' : ''
        if (outcome === 'no-credits') {
          toast.update(toastId, {
            variant: 'error',
            title: 'Not enough AI credits',
            description: `Creating a card uses 1 credit. “${term}” wasn’t added.${noDict} Add credits in Preferences, then retry.`,
            action: { label: 'Retry', onClick: retry },
          })
        } else if (outcome === 'ai-unavailable') {
          toast.update(toastId, {
            variant: 'error',
            title: 'AI is unavailable right now',
            description: `“${term}” wasn’t added.${noDict} Try again in a few minutes.`,
            action: { label: 'Retry', onClick: retry },
          })
        } else if (outcome === 'dictionary-changed') {
          toast.update(toastId, {
            variant: 'error',
            title: 'This dictionary changed',
            description: `“${dictName}” was changed on another device, so nothing was added. Choose a dictionary again.`,
            action: {
              label: 'Choose again',
              onClick: () => {
                setState({ step: 'loading', selection: sel, duplicate: null })
                window.setTimeout(() => setState((p) => (p.step === 'loading' ? { ...p, step: 'pick' } : p)), 450)
              },
            },
          })
        } else {
          toast.update(toastId, {
            variant: 'error',
            title: 'This text is no longer available',
            description: 'It was archived or its link was turned off, so the word couldn’t be added.',
          })
        }
      }, 1600)
    }
    run()
  }

  const isInflight = (dictionaryId: string) => {
    if (!selection) return false
    const prefix = `${selection.pairId}|${selection.side}|${selection.sentenceIndex ?? 0}|${selection.start ?? 0}->`
    return Boolean(inflightRef.current[`${prefix}${dictionaryId}`])
  }

  const marks: TextMark[] = useMemo(() => {
    const list = Object.values(inflight)
    if (selection?.kind === 'valid' && PANEL_STEPS.includes(step) && selection.pairId && selection.side) {
      list.push({
        pairId: selection.pairId, side: selection.side, sentenceIndex: selection.sentenceIndex ?? 0,
        start: selection.start ?? 0, end: selection.end ?? 0, state: 'selected',
      })
    }
    return list
  }, [inflight, selection, step])

  return {
    step,
    selection,
    duplicate: state.duplicate,
    direction,
    compatible,
    marks,
    signingIn,
    onSelection,
    open,
    close,
    signIn,
    submit,
    isInflight,
    goNew: () => setStep('new'),
    backToPick: () => setState((prev) => ({ ...prev, step: 'pick', duplicate: null })),
  }
}

export type CollectController = ReturnType<typeof useCollect>
