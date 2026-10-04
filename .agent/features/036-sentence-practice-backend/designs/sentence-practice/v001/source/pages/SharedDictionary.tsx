import React, { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { InlineAlert } from '../components/InlineAlert'
import { LanguagePair } from '../components/common/Chips'
import { PracticeLauncher } from '../components/practice/PracticeLauncher'
import { useApp } from '../contexts/AppContext'
import { usePractice } from '../contexts/PracticeContext'
import { SHARED_OWNER_NAME } from '../data/practiceFixtures'

/** Reader's view of an unlisted shared dictionary — context only, read-only. */
export function SharedDictionary() {
  const { dictionaryId = '' } = useParams()
  const [params] = useSearchParams()
  const { getDictionary, cardsFor } = useApp()
  const { viewer, setViewer } = usePractice()
  const dictionary = getDictionary(dictionaryId)
  const asAnonymous = params.get('as') === 'anonymous'

  useEffect(() => {
    setViewer(asAnonymous ? 'anonymous' : 'reader')
  }, [asAnonymous, setViewer])

  if (!dictionary) {
    return (
      <InlineAlert tone="error" title="This shared dictionary isn’t available">
        The link may have stopped working, or the owner stopped sharing it.
      </InlineAlert>
    )
  }

  const cards = cardsFor(dictionary.id).filter((card) => card.status === 'active' && card.translation)

  return (
    <div className="space-y-6">
      <Card
        variant="outlined"
        padding="none"
        className="border-border-default bg-background-surface p-3 text-text-primary sm:p-4"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
              Shared by {SHARED_OWNER_NAME}
            </p>
            <h1 className="mt-1 break-words text-2xl font-semibold text-text-primary">{dictionary.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <LanguagePair dictionary={dictionary} />
              <Badge size="sm" tone="neutral">
                Unlisted · read-only
              </Badge>
              {viewer === 'anonymous' ? (
                <Badge size="sm" tone="warning">
                  Not signed in
                </Badge>
              ) : null}
            </div>
          </div>
          <PracticeLauncher dictionary={dictionary} />
        </div>
      </Card>

      {viewer === 'anonymous' ? (
        <InlineAlert tone="info" title="You’re viewing as a guest">
          You can read this dictionary. Sign in from Learn → Sentence practice to keep your own
          practice and history.
        </InlineAlert>
      ) : null}

      <ul className="grid gap-2 sm:grid-cols-2">
        {cards.map((card) => (
          <li
            key={card.id}
            className="rounded-xl border border-border-default bg-background-surface p-3"
          >
            <p lang={dictionary.sourceLanguage} className="break-words font-semibold text-text-primary">
              {card.source}
            </p>
            <p lang={dictionary.targetLanguage} className="break-words text-sm text-text-secondary">
              {card.translation}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

