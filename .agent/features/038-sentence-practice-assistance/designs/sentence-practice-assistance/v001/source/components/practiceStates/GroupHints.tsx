import React from 'react'
import { StateSection } from '../states/StateFrame'
import { LiveFrame } from './LiveFrame'
import { activeState, ex, fromTemplate } from '../../utils/gallerySeeds'
import { arabicExercise, germanLegacy, japaneseExercise } from '../../data/practiceFixturesLegacy'

export function GroupHints() {
  const rain = fromTemplate(1)
  const coffee = fromTemplate(0)
  return (
    <StateSection
      id="sph-b"
      title="B · Required words and contextual hints"
      description="Required dictionary words: bold with a solid underline and a “Required word” label. Extra help: dashed underline, “Extra help”. Unhinted grammar words (я, после, буду) stay plain. Every occurrence is its own keyboard/touch trigger; only one popover opens at a time."
    >
      <LiveFrame label="New rich example — before any hint" ids={['SPH-03', 'SPH-05']} seed={{ state: activeState(ex.friend) }} />
      <LiveFrame
        label="Multiple ordinary helpers — verb expression open"
        ids={['SPH-03', 'SPH-04']}
        note="«навещаю» → “rendre visite”: one meaningful verb expression."
        seed={{ state: activeState(ex.friend, { revealedHints: ['h-today', 'h-visit'] }) }}
        initialOpenHint={2}
      />
      <LiveFrame label="Whole idiom — one span, whole meaning" ids={['SPH-04', 'SPH-05']} seed={{ state: activeState(ex.idiom) }} initialOpenHint={2} />
      <LiveFrame label="Required multiword phrase (по дороге → en chemin)" ids={['SPH-04']} seed={{ state: activeState(coffee) }} initialOpenHint={5} />
      <LiveFrame
        label="Repeated required word — distinct triggers, shared hint"
        ids={['SPH-04', 'SPH-05']}
        note="«дом» and «домом» share “maison”. The second occurrence is the active trigger; the first shows as already seen."
        seed={{ state: activeState(ex.house, { revealedHints: ['h-maison'] }) }}
        initialOpenHint={10}
      />
      <LiveFrame label="Long sentence with a wrapping phrase" ids={['SPH-04', 'SPH-16']} width={420} seed={{ state: activeState(rain) }} initialOpenHint={19} height={700} />
      <LiveFrame
        label="Legacy saved example — dictionary hints only"
        ids={['SPH-02', 'SPH-05']}
        note="No paid enrichment or regeneration is required to use it."
        seed={{ state: activeState(ex.arrive) }}
      />
      <LiveFrame
        label="German legacy example (other dictionary)"
        ids={['SPH-05']}
        dictionaryName="German · daily routines"
        config={{ dictionaryId: 'dict-de-en', direction: 'forward', sentenceLanguage: 'de', answerLanguage: 'en', explanationLanguage: 'en', entryIds: ['card-de-gehen', 'card-de-zufuss', 'card-de-arbeit'] }}
        seed={{ state: { status: 'active', items: [{ exercise: germanLegacy[0], attempts: [], reviewed: false, comparison: null, skipped: false, finalDraft: '' }], seen: ['card-de-gehen', 'card-de-zufuss', 'card-de-arbeit'], isFinal: true } }}
      />
      <LiveFrame
        label="No-space script — phrase stays grouped (Japanese)"
        ids={['SPH-04', 'SPH-18']}
        config={{ sentenceLanguage: 'ja', answerLanguage: 'en', entryIds: ['ja-station', 'ja-walk'] }}
        seed={{ state: { status: 'active', items: [{ exercise: japaneseExercise, attempts: [], reviewed: false, comparison: null, skipped: false, finalDraft: '' }], seen: ['ja-station', 'ja-walk'], isFinal: true } }}
        initialOpenHint={4}
      />
      <LiveFrame
        label="Right-to-left sentence (Arabic), English interface"
        ids={['SPH-04', 'SPH-18']}
        config={{ sentenceLanguage: 'ar', answerLanguage: 'en', entryIds: ['card-ar-ticket'] }}
        seed={{
          state: {
            status: 'active',
            items: [{ exercise: arabicExercise, attempts: [], reviewed: false, comparison: null, skipped: false, finalDraft: '' }],
            seen: ['card-ar-ticket'],
            isFinal: true,
            draft: 'I would like a return ticket إلى الإسكندرية, please.',
          },
        }}
        initialOpenHint={2}
        note="Mixed-direction draft keeps its own direction (dir=auto)."
      />
      <LiveFrame
        label="Keyboard-opened popover, dark theme"
        ids={['SPH-04', 'SPH-18']}
        theme="dark"
        note="Tab to a marked word, Enter/Space opens, Escape closes and returns focus to the same word."
        seed={{ state: activeState(ex.friend, { revealedHints: ['h-ami'] }) }}
        initialOpenHint={4}
      />
    </StateSection>
  )
}

