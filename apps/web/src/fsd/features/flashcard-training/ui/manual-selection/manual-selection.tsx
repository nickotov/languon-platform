import type { ChangeEvent } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Checkbox,
    InlineAlert,
    Input,
    Skeleton,
} from '@/fsd/shared/ui';
import { useManualSelection } from '../../hooks/use-manual-selection';
import type { EntryPreview, LearningApi } from '../../types';

export interface TrainingLanguage {
    code: string;
    name: string;
    direction: 'ltr' | 'rtl';
}
export function ManualSelection({
    api,
    selectedIds,
    onToggle,
    onSetMany,
    onClear,
    sourceLanguage,
    targetLanguage,
    disabled,
}: {
    api: LearningApi;
    selectedIds: Set<string>;
    onToggle(id: string): void;
    onSetMany(ids: string[], selected: boolean): void;
    onClear(): void;
    sourceLanguage: TrainingLanguage;
    targetLanguage: TrainingLanguage;
    disabled: boolean;
}) {
    const { t } = useI18n();
    const selection = useManualSelection(api);
    const pageIds = selection.entries.map((entry) => entry.entryId);
    const all =
        pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    const mixed = !all && pageIds.some((id) => selectedIds.has(id));
    const selectedLabel = t('training.selected', { count: selectedIds.size });
    const pageLabel = t('training.page', { count: selection.page });
    const selectLabel = t('training.selectPage', { count: pageIds.length });
    const emptyLabel = t('training.noMatch', { query: selection.query });
    const previousDisabled =
        disabled || selection.page <= 1 || selection.status === 'loading';
    const nextDisabled =
        disabled || !selection.nextCursor || selection.status === 'loading';
    function handleSearch(event: ChangeEvent<HTMLInputElement>) {
        selection.setSearch(event.target.value);
    }
    function handlePage() {
        onSetMany(pageIds, !all);
    }

    return (
        <fieldset
            disabled={disabled}
            className='flex min-w-0 flex-col gap-3 rounded-2xl border border-border-default bg-background-surface p-4'
        >
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <p
                    aria-live='polite'
                    className='text-sm font-medium text-text-primary'
                >
                    {selectedLabel}
                </p>
                <Button
                    variant='ghost'
                    size='compact'
                    onClick={onClear}
                    disabled={selectedIds.size === 0}
                >
                    {t('training.clear')}
                </Button>
            </div>
            <Input
                label={t('training.search')}
                type='search'
                value={selection.search}
                onChange={handleSearch}
                placeholder={t('training.searchPlaceholder')}
                leadingIcon={<Search className='h-4 w-4' />}
                hint={t('training.selectionHelp')}
            />
            {selection.status === 'error' && (
                <InlineAlert
                    tone='error'
                    title={t('training.error')}
                    actions={
                        <Button
                            variant='secondary'
                            size='compact'
                            onClick={selection.retry}
                        >
                            {t('training.retry')}
                        </Button>
                    }
                >
                    {t('training.network')}
                </InlineAlert>
            )}
            {selection.status === 'loading' && <Skeleton lines={6} />}
            {selection.status === 'ready' && selection.entries.length === 0 && (
                <p className='py-4 text-center text-sm text-text-secondary'>
                    {emptyLabel}
                </p>
            )}
            {selection.status === 'ready' && selection.entries.length > 0 && (
                <>
                    <Checkbox
                        label={selectLabel}
                        checked={all}
                        indeterminate={mixed}
                        onChange={handlePage}
                    />
                    <ul className='flex flex-col divide-y divide-border-default rounded-xl border border-border-default'>
                        {selection.entries.map((entry) => (
                            <SelectionRow
                                key={entry.entryId}
                                entry={entry}
                                checked={selectedIds.has(entry.entryId)}
                                onToggle={onToggle}
                                sourceLanguage={sourceLanguage}
                                targetLanguage={targetLanguage}
                            />
                        ))}
                    </ul>
                </>
            )}
            <nav
                aria-label={t('training.pages')}
                className='flex items-center justify-between gap-2'
            >
                <Button
                    variant='secondary'
                    size='compact'
                    leadingIcon={<ChevronLeft className='h-4 w-4' />}
                    disabled={previousDisabled}
                    onClick={selection.previous}
                >
                    {t('training.previous')}
                </Button>
                <span className='text-sm text-text-secondary'>{pageLabel}</span>
                <Button
                    variant='secondary'
                    size='compact'
                    trailingIcon={<ChevronRight className='h-4 w-4' />}
                    disabled={nextDisabled}
                    onClick={selection.next}
                >
                    {t('training.next')}
                </Button>
            </nav>
        </fieldset>
    );
}

function SelectionRow({
    entry,
    checked,
    onToggle,
    sourceLanguage,
    targetLanguage,
}: {
    entry: EntryPreview;
    checked: boolean;
    onToggle(id: string): void;
    sourceLanguage: TrainingLanguage;
    targetLanguage: TrainingLanguage;
}) {
    function handleChange() {
        onToggle(entry.entryId);
    }
    const label = (
        <span className='grid min-w-0 grid-cols-2 gap-3'>
            <span
                lang={sourceLanguage.code}
                dir={sourceLanguage.direction}
                className='truncate text-text-primary'
            >
                {entry.source}
            </span>
            <span
                lang={targetLanguage.code}
                dir={targetLanguage.direction}
                className='truncate text-text-secondary'
            >
                {entry.translation}
            </span>
        </span>
    );
    return (
        <li className='min-w-0 px-3 py-1'>
            <Checkbox checked={checked} onChange={handleChange} label={label} />
        </li>
    );
}
