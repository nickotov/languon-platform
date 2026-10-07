import React from 'react'
import { StateFrame, StateSection } from '../states/StateFrame'
import { SentenceRow } from '../sentences/SentenceRow'
import { SentenceDetail } from '../sentences/SentenceDetail'
import { SelectionToolbar } from '../sentences/SelectionToolbar'
import { LibraryEmpty, LibraryLoadError, LibrarySkeleton, LoadMore } from '../sentences/LibraryStates'
import { InlineAlert } from '../InlineAlert'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import { DialogLauncher, dialogFixtures, sentence, toolbarPage } from './StatesKit'

const noop = () => undefined

function Rows({ ids, selected = [] }: { ids: string[]; selected?: string[] }) {
  return (
    <ul className="space-y-2">
      {ids.map((id) => (
        <SentenceRow key={id} sentence={sentence(id)} selected={selected.includes(id)} onToggle={noop} onView={noop} onArchiveToggle={noop} />
      ))}
    </ul>
  )
}

/** Library list, empty/error, detail, selection and confirmation states. */
export function LibraryGroups() {
  const { L } = useInterfaceText()
  return (
    <>
      <StateSection id="lib-list" title="1 · Library list" description="Initial skeleton is distinct from next-page loading. Rows keep the reference hidden; the French → Russian example carries an explicit badge.">
        <StateFrame label="Initial loading">
          <LibrarySkeleton rows={3} />
        </StateFrame>
        <StateFrame label="Successful list with mixed badges">
          <Rows ids={['ss-help', 'ss-fr', 'ss-outdated', 'ss-mine-archived']} />
        </StateFrame>
        <StateFrame label="Very long sentences and words" width={360}>
          <Rows ids={['ss-long', 'ss-longword', 'ss-mixed']} />
        </StateFrame>
        <StateFrame label="Loading next page — loaded rows stay">
          <div className="space-y-3">
            <Rows ids={['ss-help']} />
            <LoadMore shown={25} total={186} status="loading" onLoad={noop} />
          </div>
        </StateFrame>
        <StateFrame label="Next-page failure keeps loaded rows">
          <div className="space-y-3">
            <Rows ids={['ss-help']} />
            <LoadMore shown={25} total={186} status="error" onLoad={noop} />
          </div>
        </StateFrame>
        <StateFrame label="Initial load failure">
          <LibraryLoadError onRetry={noop} />
        </StateFrame>
        <StateFrame label="Dark theme list" theme="dark">
          <Rows ids={['ss-help', 'ss-combo']} selected={['ss-help']} />
        </StateFrame>
      </StateSection>

      <StateSection id="lib-empty" title="2 · Empty states" description="Empty groups explain what to do; none of them look like errors.">
        <StateFrame label="No saved examples yet">
          <LibraryEmpty kind="none" onPractice={noop} />
        </StateFrame>
        <StateFrame label="No results for filters">
          <LibraryEmpty kind="no-results" onReset={noop} />
        </StateFrame>
        <StateFrame label="Personal archive is empty">
          <LibraryEmpty kind="archive-empty" onReset={noop} />
        </StateFrame>
        <StateFrame label="Zero AI credits — preview and archive stay free">
          <div className="space-y-3">
            <p className="rounded-lg bg-background-subtle p-2 text-xs text-text-secondary">{L('zeroCredits')}</p>
            <Rows ids={['ss-help']} />
          </div>
        </StateFrame>
      </StateSection>

      <StateSection id="lib-detail" title="3 · Detailed preview" description="Preview only: no answer field, no score, no review record. Dictionary words and other helpful words are separate; phrases stay whole.">
        <StateFrame label="Rich example, reference expanded">
          <SentenceDetail inline initiallyExpanded sentence={sentence('ss-help')} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
        <StateFrame label="Legacy example — no extra hints">
          <SentenceDetail inline sentence={sentence('ss-legacy')} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
        <StateFrame label="Outdated">
          <SentenceDetail inline sentence={sentence('ss-outdated')} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
        <StateFrame label="Removed by me + globally archived + outdated">
          <SentenceDetail inline sentence={sentence('ss-combo')} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
        <StateFrame label="Globally archived (read-only)">
          <SentenceDetail inline sentence={sentence('ss-global')} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
        <StateFrame label="French → Russian example" theme="dark">
          <SentenceDetail inline initiallyExpanded sentence={sentence('ss-fr')} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
        <StateFrame label="Detail loading">
          <SentenceDetail inline forceState="loading" sentence={sentence('ss-help')} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
        <StateFrame label="Detail load failure">
          <SentenceDetail inline forceState="failed" sentence={sentence('ss-help')} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
        <StateFrame label="Removed while open">
          <SentenceDetail inline forceState="removed" sentence={undefined} onClose={noop} onArchiveToggle={noop} />
        </StateFrame>
      </StateSection>

      <StateSection id="lib-select" title="4 · Selection and archive" description="Honest scope copy: a page is never presented as the whole dictionary. Submission is non-blocking and keeps the chosen scope.">
        <StateFrame label="12 selected on this page">
          <SelectionToolbar page={toolbarPage({ visibleCount: 12, selection: { selectedCount: 12, pageAllSelected: true, selectionIsPage: true, archivableCount: 12 } })} />
        </StateFrame>
        <StateFrame label="All 186 matching filters">
          <SelectionToolbar page={toolbarPage({ selection: { allMatching: true, selectedCount: 186, pageAllSelected: true, archivableCount: 186 } })} />
        </StateFrame>
        <StateFrame label="Mixed selection: remove and restore">
          <SelectionToolbar page={toolbarPage({ selection: { selectedCount: 4, archivableCount: 3, restorableCount: 1 } })} />
        </StateFrame>
        <StateFrame label="Submitting">
          <SelectionToolbar page={toolbarPage({ submission: { status: 'submitting', action: 'archive', count: 12 } })} />
        </StateFrame>
        <StateFrame label="Failure keeps selection">
          <SelectionToolbar page={toolbarPage({ submission: { status: 'failed', action: 'archive' }, selection: { selectedCount: 12, archivableCount: 12 } })} />
        </StateFrame>
        <StateFrame label="Confirmations (open the real dialog)">
          <div className="flex flex-wrap gap-2">
            <DialogLauncher state={dialogFixtures.confirmPage} label="Remove 12" />
            <DialogLauncher state={dialogFixtures.confirmAll} label="Remove all 186" />
            <DialogLauncher state={dialogFixtures.confirmRestore} label="Restore 3" />
            <DialogLauncher state={dialogFixtures.confirmPage} label="Zero credits" zeroCredits />
            <DialogLauncher state={dialogFixtures.stale} label="Selection changed" />
            <DialogLauncher state={dialogFixtures.expired} label="Expired" />
            <DialogLauncher state={dialogFixtures.superseded} label="Superseded" />
            <DialogLauncher state={dialogFixtures.tooMany} label="Over 10,000" />
            <DialogLauncher state={dialogFixtures.limit} label="Too many pending" />
          </div>
        </StateFrame>
        <StateFrame label="Success notice copy">
          <InlineAlert tone="success" title={L('successRemoved', { n: 12 })}>
            {L('undo')} — {L('confirmRemoveBody')}
          </InlineAlert>
        </StateFrame>
      </StateSection>
    </>
  )
}

