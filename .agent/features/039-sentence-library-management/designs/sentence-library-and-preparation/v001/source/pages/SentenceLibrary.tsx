import React, { useCallback, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRightIcon, EyeOffIcon, MessageSquareTextIcon, SparklesIcon } from 'lucide-react'
import { Breadcrumb } from '../components/Breadcrumb'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Checkbox } from '../components/Checkbox'
import { InlineAlert } from '../components/InlineAlert'
import { LanguagePair } from '../components/common/Chips'
import { LibraryFilters } from '../components/sentences/LibraryFilters'
import { SentenceRow } from '../components/sentences/SentenceRow'
import { SelectionToolbar } from '../components/sentences/SelectionToolbar'
import { ArchiveConfirmDialog } from '../components/sentences/ArchiveConfirmDialog'
import { SentenceDetail } from '../components/sentences/SentenceDetail'
import { LibraryEmpty, LibraryLoadError, LibrarySkeleton, LoadMore } from '../components/sentences/LibraryStates'
import { PreparationChip } from '../components/preparation/PreparationChip'
import { useApp } from '../contexts/AppContext'
import { useSentenceLibrary } from '../contexts/SentenceLibraryContext'
import { usePreparation } from '../contexts/PreparationContext'
import { useSentenceLibraryPage } from '../hooks/useSentenceLibrary'
import { useInterfaceText } from '../hooks/useInterfaceText'
import { t } from '../data/i18n'

/** Saved sentence library: preview and personal archive management. Never practice, never a score. */
export function SentenceLibrary() {
  const { dictionaryId = '', exampleId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { getDictionary, locale } = useApp()
  const library = useSentenceLibrary()
  const preparation = usePreparation()
  const { L } = useInterfaceText()
  const page = useSentenceLibraryPage(dictionaryId)
  const lastTrigger = useRef<HTMLElement | null>(null)
  const dictionary = getDictionary(dictionaryId)

  const openDetail = useCallback(
    (id: string, trigger: HTMLElement) => {
      lastTrigger.current = trigger
      navigate({ pathname: `/d/${dictionaryId}/sentences/${id}`, search: location.search })
    },
    [dictionaryId, location.search, navigate],
  )
  const closeDetail = useCallback(() => {
    navigate({ pathname: `/d/${dictionaryId}/sentences`, search: location.search })
    window.setTimeout(() => lastTrigger.current?.focus(), 0)
  }, [dictionaryId, location.search, navigate])

  if (!dictionary) {
    return (
      <InlineAlert tone="error" title={L('detailRemovedTitle')} actions={<Button size="compact" variant="secondary" onClick={() => navigate('/')}>{t('navLibrary', locale)}</Button>}>
        {L('detailRemovedBody')}
      </InlineAlert>
    )
  }

  const run = preparation.runFor(dictionary.id)
  const goPractice = (extra = '') => navigate(`/d/${dictionary.id}?practice=setup${extra}`)
  const locked = page.submission.status === 'submitting'
  const emptyKind = page.all.length === 0 ? 'none' : page.filters.mine === 'archived' && page.matching.length === 0 ? 'archive-empty' : 'no-results'

  return (
    <div className="space-y-5 pb-28 lg:pb-16">
      <Breadcrumb
        className="[&_a:hover]:text-text-primary [&_a]:text-text-secondary"
        items={[
          { label: t('navLibrary', locale), href: '/', onClick: (e) => { e.preventDefault(); navigate('/') } },
          { label: dictionary.name, href: `/d/${dictionary.id}`, onClick: (e) => { e.preventDefault(); navigate(`/d/${dictionary.id}`) } },
          { label: L('title') },
        ]}
      />

      <Card variant="outlined" padding="none" className="border-border-default bg-background-surface p-4 text-text-primary">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
              <MessageSquareTextIcon aria-hidden className="h-6 w-6 shrink-0 text-text-secondary" />
              {L('title')}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{dictionary.name}</span>
              <LanguagePair dictionary={dictionary} />
            </div>
            <p className="max-w-2xl text-sm text-text-secondary">{L('intro')}</p>
            {run ? (
              <div className="pt-1">
                <PreparationChip run={run} onOpen={() => navigate(`/d/${dictionary.id}?practice=progress`)} />
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start lg:flex-col lg:items-end">
            <Button trailingIcon={<ArrowRightIcon aria-hidden className="h-4 w-4 rtl:rotate-180" />} onClick={() => goPractice()}>
              {L('startPractice')}
            </Button>
            <div className="flex flex-col gap-1 lg:items-end">
              <Button variant="secondary" leadingIcon={<SparklesIcon aria-hidden className="h-4 w-4" />} onClick={() => goPractice('&prep=1')}>
                {L('prepareAhead')}
              </Button>
              <span className="text-xs text-text-secondary">{L('prepareAheadHint')}</span>
            </div>
          </div>
        </div>
        {library.scenario.credits === 'zero' ? <p className="mt-3 rounded-lg bg-background-subtle p-2 text-xs text-text-secondary">{L('zeroCredits')}</p> : null}
      </Card>

      <LibraryFilters dictionary={dictionary} filters={page.filters} activeCount={page.activeFilterCount} onChange={page.setFilter} onReset={page.resetFilters} />

      <p aria-live="polite" className="sr-only">
        {page.announcement}
      </p>

      {page.status === 'loading' ? (
        <LibrarySkeleton />
      ) : page.status === 'error' ? (
        <LibraryLoadError onRetry={page.retryLoad} />
      ) : page.matching.length === 0 ? (
        <LibraryEmpty kind={emptyKind} onReset={page.resetFilters} onPractice={() => goPractice()} />
      ) : (
        <section aria-label={L('title')} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <Checkbox
              size="sm"
              label={L('selectPage')}
              checked={page.selection.pageAllSelected}
              indeterminate={page.selection.pageSomeSelected}
              disabled={locked}
              onChange={page.selection.togglePage}
            />
            {page.filters.mine === 'available' && page.selection.selectedCount === 0 ? (
              <Button size="compact" variant="secondary" disabled={locked} leadingIcon={<EyeOffIcon aria-hidden className="h-4 w-4" />} onClick={() => page.openConfirm('archive', true)}>
                {L('removeAllMatching')}
              </Button>
            ) : null}
          </div>

          <ul className="space-y-2">
            {page.visible.map((sentence) => (
              <SentenceRow
                key={sentence.id}
                sentence={sentence}
                selected={page.selection.isSelected(sentence.id)}
                locked={locked}
                onToggle={() => page.selection.toggle(sentence.id)}
                onView={(trigger) => openDetail(sentence.id, trigger)}
                onArchiveToggle={() => page.singleToggle(sentence.id, !sentence.archivedByMe)}
              />
            ))}
          </ul>

          <div className="sticky bottom-20 z-30 lg:bottom-4">
            <SelectionToolbar page={page} />
          </div>

          <LoadMore shown={page.visible.length} total={page.matching.length} status={page.nextStatus} onLoad={page.loadMore} />
        </section>
      )}

      <ArchiveConfirmDialog
        dictionary={dictionary}
        state={page.dialog}
        filters={page.filters}
        zeroCredits={library.scenario.credits === 'zero'}
        onClose={page.closeDialog}
        onConfirm={page.confirm}
        onReconfirm={(action) => page.openConfirm(action)}
      />

      {exampleId ? (
        <SentenceDetail
          sentence={library.byId(exampleId)}
          loadOutcome={library.scenario.detail}
          onClose={closeDetail}
          onArchiveToggle={(id, archive) => page.singleToggle(id, archive)}
        />
      ) : null}
    </div>
  )
}

