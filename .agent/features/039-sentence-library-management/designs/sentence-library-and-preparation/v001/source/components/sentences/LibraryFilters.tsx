import React, { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, LockIcon, RotateCcwIcon, SlidersHorizontalIcon } from 'lucide-react'
import { Select } from '../Select'
import { Button } from '../Button'
import { Badge } from '../Badge'
import { ResponsiveSheet } from '../card/ResponsiveSheet'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import { useIsCompact } from '../../hooks/useMediaQuery'
import type { Dictionary } from '../../types/dictionary'
import type { LibraryFilters as Filters } from '../../types/sentenceLibrary'

interface LibraryFiltersProps {
  dictionary: Dictionary
  filters: Filters
  activeCount: number
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  onReset: () => void
}

/** Compact filter hierarchy: direction first, personal visibility, currentness, then advanced global status. */
export function LibraryFilters(props: LibraryFiltersProps) {
  const compact = useIsCompact()
  const { L } = useInterfaceText()
  const [sheetOpen, setSheetOpen] = useState(false)

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="compact" leadingIcon={<SlidersHorizontalIcon aria-hidden className="h-4 w-4" />} onClick={() => setSheetOpen(true)}>
          {props.activeCount ? L('filtersButton', { n: props.activeCount }) : L('filtersTitle')}
        </Button>
        {props.activeCount ? (
          <Button variant="secondary" size="compact" leadingIcon={<RotateCcwIcon aria-hidden className="h-4 w-4" />} onClick={props.onReset}>
            {L('resetFilters')}
          </Button>
        ) : null}
        <ResponsiveSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={L('filtersTitle')}
          size="sm"
          footer={
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              {L('applyFilters')}
            </Button>
          }
        >
          <FilterControls {...props} stacked advancedOpenDefault />
        </ResponsiveSheet>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border-default bg-background-surface p-3">
      <FilterControls {...props} stacked={false} advancedOpenDefault={props.filters.global !== 'active'} />
    </div>
  )
}

function FilterControls({
  dictionary,
  filters,
  activeCount,
  onChange,
  onReset,
  stacked,
  advancedOpenDefault,
}: LibraryFiltersProps & { stacked: boolean; advancedOpenDefault: boolean }) {
  const { L, direction } = useInterfaceText()
  const [advanced, setAdvanced] = useState(advancedOpenDefault)
  const reverseLabel = direction(dictionary.targetLanguage, dictionary.sourceLanguage)
  const forwardLabel = direction(dictionary.sourceLanguage, dictionary.targetLanguage)

  return (
    <div className="space-y-3">
      <div className={stacked ? 'space-y-3' : 'grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]'}>
        <Select
          size="sm"
          fullWidth
          label={L('filterDirection')}
          value={filters.direction}
          onChange={(e) => onChange('direction', e.target.value as Filters['direction'])}
          options={[
            { value: 'reverse', label: reverseLabel },
            { value: 'forward', label: forwardLabel },
          ]}
        />
        <Select
          size="sm"
          fullWidth
          label={L('filterMine')}
          value={filters.mine}
          onChange={(e) => onChange('mine', e.target.value as Filters['mine'])}
          options={[
            { value: 'available', label: L('mineAvailable') },
            { value: 'archived', label: L('mineArchived') },
            { value: 'all', label: L('mineAll') },
          ]}
        />
        <Select
          size="sm"
          fullWidth
          label={L('filterCurrent')}
          value={filters.current}
          onChange={(e) => onChange('current', e.target.value as Filters['current'])}
          options={[
            { value: 'all', label: L('curAll') },
            { value: 'current', label: L('curCurrent') },
            { value: 'outdated', label: L('curOutdated') },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={advanced}
          aria-controls="library-advanced-filters"
          onClick={() => setAdvanced((v) => !v)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {advanced ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
          {L('advanced')}
          {filters.global !== 'active' ? <Badge size="sm" tone="info">1</Badge> : null}
        </button>
        {!stacked && activeCount > 0 ? (
          <Button variant="secondary" size="compact" leadingIcon={<RotateCcwIcon aria-hidden className="h-4 w-4" />} onClick={onReset}>
            {L('resetFilters')}
          </Button>
        ) : null}
      </div>

      {advanced ? (
        <div id="library-advanced-filters" className="space-y-2 rounded-lg border border-dashed border-border-strong p-3">
          <div className={stacked ? '' : 'max-w-sm'}>
            <Select
              size="sm"
              fullWidth
              label={L('filterGlobal')}
              value={filters.global}
              onChange={(e) => onChange('global', e.target.value as Filters['global'])}
              options={[
                { value: 'active', label: L('globActive') },
                { value: 'archived', label: L('globArchived') },
                { value: 'all', label: L('globAll') },
              ]}
            />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-text-secondary">
            <LockIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium text-text-primary">{L('readOnly')}.</span> {L('globalHelp')}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  )
}

