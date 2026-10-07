import React, { useState, type ChangeEvent } from 'react';
import {
    ChevronDownIcon,
    ChevronUpIcon,
    LockIcon,
    RotateCcwIcon,
    SlidersHorizontalIcon,
} from 'lucide-react';
import { Select } from '@/fsd/shared/ui';
import { Button } from '@/fsd/shared/ui';
import { Badge } from '@/fsd/shared/ui';
import { BottomSheet as ResponsiveSheet } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import { useIsCompact } from '../../hooks/use-is-compact';
import type {
    LibraryDictionary as Dictionary,
    SentenceLibraryFilters as Filters,
} from '../../types';

interface LibraryFiltersProps {
    dictionary: Dictionary;
    filters: Filters;
    activeCount: number;
    onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
    onReset: () => void;
}

/** Compact filter hierarchy: direction first, personal visibility, currentness, then advanced global status. */
export function LibraryFilters(props: LibraryFiltersProps) {
    const compact = useIsCompact();
    const { L } = useInterfaceText();
    const [sheetOpen, setSheetOpen] = useState(false);

    function openSheet() {
        setSheetOpen(true);
    }
    function closeSheet() {
        setSheetOpen(false);
    }
    if (compact) {
        return (
            <div className='flex flex-wrap items-center gap-2'>
                <Button
                    variant='secondary'
                    size='compact'
                    leadingIcon={
                        <SlidersHorizontalIcon
                            aria-hidden
                            className='h-4 w-4'
                        />
                    }
                    onClick={openSheet}
                >
                    {props.activeCount
                        ? L('filtersButton', { n: props.activeCount })
                        : L('filtersTitle')}
                </Button>
                {props.activeCount ? (
                    <Button
                        variant='secondary'
                        size='compact'
                        leadingIcon={
                            <RotateCcwIcon aria-hidden className='h-4 w-4' />
                        }
                        onClick={props.onReset}
                    >
                        {L('resetFilters')}
                    </Button>
                ) : null}
                <ResponsiveSheet
                    open={sheetOpen}
                    closeLabel={L('close')}
                    onClose={closeSheet}
                    title={L('filtersTitle')}
                    size='sm'
                    footer={
                        <Button fullWidth onClick={closeSheet}>
                            {L('applyFilters')}
                        </Button>
                    }
                >
                    <FilterControls {...props} stacked advancedOpenDefault />
                </ResponsiveSheet>
            </div>
        );
    }

    return (
        <div className='rounded-xl border border-border-default bg-background-surface p-3'>
            <FilterControls
                {...props}
                stacked={false}
                advancedOpenDefault={props.filters.globalArchive !== 'active'}
            />
        </div>
    );
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
    const { L, direction } = useInterfaceText();
    const [advanced, setAdvanced] = useState(advancedOpenDefault);
    function changeDirection(event: ChangeEvent<HTMLSelectElement>) {
        onChange('direction', event.target.value as Filters['direction']);
    }
    function changeMine(event: ChangeEvent<HTMLSelectElement>) {
        onChange(
            'personalArchive',
            event.target.value as Filters['personalArchive'],
        );
    }
    function changeCurrent(event: ChangeEvent<HTMLSelectElement>) {
        onChange('contentState', event.target.value as Filters['contentState']);
    }
    function changeGlobal(event: ChangeEvent<HTMLSelectElement>) {
        onChange(
            'globalArchive',
            event.target.value as Filters['globalArchive'],
        );
    }
    function toggleAdvanced() {
        setAdvanced((value) => !value);
    }
    const reverseLabel = direction(
        dictionary.targetLanguage,
        dictionary.sourceLanguage,
    );
    const forwardLabel = direction(
        dictionary.sourceLanguage,
        dictionary.targetLanguage,
    );

    return (
        <div className='space-y-3'>
            <div
                className={
                    stacked
                        ? 'space-y-3'
                        : 'grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]'
                }
            >
                <Select
                    size='sm'
                    fullWidth
                    label={L('filterDirection')}
                    value={filters.direction}
                    onChange={changeDirection}
                    options={[
                        { value: 'target-to-source', label: reverseLabel },
                        { value: 'source-to-target', label: forwardLabel },
                    ]}
                />
                <Select
                    size='sm'
                    fullWidth
                    label={L('filterMine')}
                    value={filters.personalArchive}
                    onChange={changeMine}
                    options={[
                        { value: 'active', label: L('mineAvailable') },
                        { value: 'archived', label: L('mineArchived') },
                        { value: 'all', label: L('mineAll') },
                    ]}
                />
                <Select
                    size='sm'
                    fullWidth
                    label={L('filterCurrent')}
                    value={filters.contentState}
                    onChange={changeCurrent}
                    options={[
                        { value: 'all', label: L('curAll') },
                        { value: 'current', label: L('curCurrent') },
                        { value: 'outdated', label: L('curOutdated') },
                    ]}
                />
            </div>

            <div className='flex flex-wrap items-center justify-between gap-2'>
                <button
                    type='button'
                    aria-expanded={advanced}
                    aria-controls='library-advanced-filters'
                    onClick={toggleAdvanced}
                    className='inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus'
                >
                    {advanced ? (
                        <ChevronUpIcon aria-hidden className='h-4 w-4' />
                    ) : (
                        <ChevronDownIcon aria-hidden className='h-4 w-4' />
                    )}
                    {L('advanced')}
                    {filters.globalArchive !== 'active' ? (
                        <Badge size='sm' tone='info'>
                            1
                        </Badge>
                    ) : null}
                </button>
                {!stacked && activeCount > 0 ? (
                    <Button
                        variant='secondary'
                        size='compact'
                        leadingIcon={
                            <RotateCcwIcon aria-hidden className='h-4 w-4' />
                        }
                        onClick={onReset}
                    >
                        {L('resetFilters')}
                    </Button>
                ) : null}
            </div>

            {advanced ? (
                <div
                    id='library-advanced-filters'
                    className='space-y-2 rounded-lg border border-dashed border-border-strong p-3'
                >
                    <div className={stacked ? '' : 'max-w-sm'}>
                        <Select
                            size='sm'
                            fullWidth
                            label={L('filterGlobal')}
                            value={filters.globalArchive}
                            onChange={changeGlobal}
                            options={[
                                { value: 'active', label: L('globActive') },
                                { value: 'archived', label: L('globArchived') },
                                { value: 'all', label: L('globAll') },
                            ]}
                        />
                    </div>
                    <p className='flex items-start gap-1.5 text-xs text-text-secondary'>
                        <LockIcon
                            aria-hidden
                            className='mt-0.5 h-3.5 w-3.5 shrink-0'
                        />
                        <span>
                            <span className='font-medium text-text-primary'>
                                {L('readOnly')}.
                            </span>{' '}
                            {L('globalHelp')}
                        </span>
                    </p>
                </div>
            ) : null}
        </div>
    );
}
