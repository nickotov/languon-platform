import type { ChangeEvent } from 'react';
import { SENTENCE_LIMITS } from '@languon/contracts';
import { Button, Checkbox, Input, LoadingState } from '@/fsd/shared/ui';
import type { SentenceSetupController } from '../../types';
import { SentenceErrorNotice } from '../sentence-errors/sentence-errors';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-setup.module.css';

export function SentenceEntrySelection({
    c,
    selectionFull,
    canSelectShown,
    selectShown,
}: {
    c: Pick<
        SentenceSetupController,
        | 'search'
        | 'setSearch'
        | 'selectedEntryIds'
        | 'setSelectedEntryIds'
        | 'entriesError'
        | 'refresh'
        | 'entries'
        | 'entriesLoading'
        | 'hasMore'
        | 'loadMore'
    >;
    selectionFull: boolean;
    canSelectShown: boolean;
    selectShown(): void;
}) {
    const { t } = useSentenceCopy();
    function changeSearch(event: ChangeEvent<HTMLInputElement>) {
        c.setSearch(event.target.value);
    }

    function clearSelection() {
        c.setSelectedEntryIds([]);
    }

    function loadMore() {
        void c.loadMore();
    }

    return (
        <div className={styles.selectionPanel}>
            <Input
                label={t('Search entries')}
                value={c.search}
                onChange={changeSearch}
            />
            <div className={styles.selectionHeader}>
                <p className={styles.setupNote}>
                    {c.selectedEntryIds.length} /{' '}
                    {SENTENCE_LIMITS.selectedEntries} {t('selected')}
                </p>
                <Button
                    size='compact'
                    variant='secondary'
                    disabled={!canSelectShown}
                    onClick={selectShown}
                >
                    {t('Select all shown')}
                </Button>
                <Button size='compact' variant='ghost' onClick={clearSelection}>
                    {t('Clear')}
                </Button>
            </div>
            {c.selectedEntryIds.length === 0 ? (
                <p className={styles.setupNote}>
                    {t('Choose at least one entry to start.')}
                </p>
            ) : null}
            {selectionFull ? (
                <p role='status' className={styles.setupNote}>
                    {t(
                        'Batch limit reached. Deselect a word to choose another.',
                    )}
                </p>
            ) : null}
            {c.entriesError ? (
                <SentenceErrorNotice
                    error={c.entriesError}
                    onRetry={c.refresh}
                />
            ) : null}
            <ul className={styles.selectionList}>
                {c.entries.map((entry) => (
                    <EntryChoice
                        key={entry.entryId}
                        entry={entry}
                        c={c}
                        selectionFull={selectionFull}
                    />
                ))}
            </ul>
            {c.entriesLoading ? (
                <LoadingState>{t('Loading entries')}</LoadingState>
            ) : c.entries.length === 0 ? (
                <p className={styles.setupNote}>
                    {t('No entries match your search.')}
                </p>
            ) : null}
            {c.hasMore ? (
                <Button
                    variant='secondary'
                    size='compact'
                    loading={c.entriesLoading}
                    onClick={loadMore}
                >
                    {t('Load more entries')}
                </Button>
            ) : null}
        </div>
    );
}

function EntryChoice({
    entry,
    c,
    selectionFull,
}: {
    entry: SentenceSetupController['entries'][number];
    c: Pick<
        SentenceSetupController,
        'selectedEntryIds' | 'setSelectedEntryIds'
    >;
    selectionFull: boolean;
}) {
    function changeSelection(event: ChangeEvent<HTMLInputElement>) {
        c.setSelectedEntryIds(
            event.target.checked
                ? [...c.selectedEntryIds, entry.entryId]
                : c.selectedEntryIds.filter((id) => id !== entry.entryId),
        );
    }

    return (
        <li key={entry.entryId}>
            <Checkbox
                disabled={
                    selectionFull && !c.selectedEntryIds.includes(entry.entryId)
                }
                checked={c.selectedEntryIds.includes(entry.entryId)}
                onChange={changeSelection}
            >
                {entry.source} → {entry.translation}
            </Checkbox>
        </li>
    );
}
