import React from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '../Button'
import { BottomSheet } from '../ui/BottomSheet'
import { languageName } from '../../utils/languages'
import type { LanguageCode, SentencePair } from '../../types/texts'

interface CounterpartSheetProps {
  pair: SentencePair | null
  index: number
  total: number
  sourceLang: LanguageCode
  targetLang: LanguageCode
  onClose: () => void
  onStep: (delta: number) => void
}

export function CounterpartSheet({ pair, index, total, sourceLang, targetLang, onClose, onStep }: CounterpartSheetProps) {
  return (
    <BottomSheet
      open={Boolean(pair)}
      onClose={onClose}
      title={`Sentence ${index + 1} of ${total}`}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => onStep(-1)} disabled={index <= 0} aria-label="Previous sentence" leadingIcon={<ChevronLeftIcon className="h-4 w-4" />}>
            <span className="sr-only sm:not-sr-only">Previous</span>
          </Button>
          <Button fullWidth onClick={onClose}>
            Back to reading
          </Button>
          <Button variant="secondary" onClick={() => onStep(1)} disabled={index >= total - 1} aria-label="Next sentence" trailingIcon={<ChevronRightIcon className="h-4 w-4" />}>
            <span className="sr-only sm:not-sr-only">Next</span>
          </Button>
        </div>
      }
    >
      {pair && (
        <div className="space-y-4" aria-live="polite">
          <section className="rounded-xl border border-border-default bg-background-subtle p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Source · {languageName(sourceLang)}</h3>
            <p lang={sourceLang} className="mt-2 break-words text-base leading-7 text-text-primary">
              {pair.source}
            </p>
          </section>
          <section className="rounded-xl border-2 border-primary-200 bg-primary-subtle p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-default">Translation · {languageName(targetLang)}</h3>
            <p lang={targetLang} className="mt-2 break-words text-base leading-7 text-text-primary">
              {pair.target}
            </p>
          </section>
        </div>
      )}
    </BottomSheet>
  )
}
