'use client';

import { Plus, Search, Trash2 } from 'lucide-react';
import { dictionaryDeletionSelectedTargetLimit } from '@languon/contracts';
import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Checkbox,
    ErrorState,
    InlineAlert,
    Input,
} from '@/fsd/shared/ui';
import { useDictionaryLibrary } from '../../hooks/use-dictionary-library';
import type { DictionaryLibraryProps } from '../../types';
import { LibraryCreateDialog } from '../library-create-dialog/library-create-dialog';
import { LibraryDeletionDialog } from '../library-deletion-dialog/library-deletion-dialog';
import { LibraryResults } from '../library-results/library-results';
import styles from '../dictionary-library-common.module.css';

export function DictionaryLibrary({
    onOpenSettings,
    requestWithSession,
}: DictionaryLibraryProps) {
    const { t } = useI18n();

    const state = useDictionaryLibrary(requestWithSession);

    const activeSelected = state.lifecycle === 'active';

    const archivedSelected = state.lifecycle === 'archived';

    const searchClass = styles.search ?? '';

    const error = state.lifecycleMutation.error;

    const errorMessage = error ? dictionaryErrorMessage(error, t) : null;

    const conflict =
        error instanceof DictionaryApiError &&
        error.detail.code === 'version_conflict';

    function resolveConflictAction() {
        if (conflict) {
            return (
                <Button onClick={state.reloadConflict} type='button'>
                    {t('dictionary.conflict.reload')}
                </Button>
            );
        }

        return undefined;
    }

    const conflictAction = resolveConflictAction();

    const loadMoreLabel = t(
        state.dictionaries.isFetchNextPageError
            ? 'dictionary.library.retryLoadMore'
            : 'dictionary.library.loadMore',
    );

    const allLoadedSelected =
        state.list.length > 0 &&
        state.list.every((entry) => state.selected.has(entry.id));

    const someLoadedSelected = state.list.some((entry) =>
        state.selected.has(entry.id),
    );

    function openSelectedDeletion() {
        state.openSelectedDeletion();
    }

    const resultsView = {
        catalog: state.catalog,
        list: state.list,
        lifecycle: state.lifecycle,
        search: state.search,
        loadError: state.loadError,
        pending: state.dictionaries.isPending || state.languages.isPending,
        disabled:
            state.lifecycleMutation.isPending || state.dictionaries.isFetching,
        retryLoad: state.retryLoad,
        openCreate: state.openCreate,
        clearSearch: state.clearSearch,
        switchLifecycle: state.switchLifecycle,
        changeLifecycle: state.lifecycleMutation.mutate,
        selected: state.selected,
        toggleSelected: state.toggleSelected,
        openSelectedDeletion: state.openSelectedDeletion,
        openSettings: onOpenSettings,
    };

    const createView = {
        catalog: state.catalog,
        createOpen: state.createOpen,
        createSourceLanguage: state.createSourceLanguage,
        createTargetLanguage: state.createTargetLanguage,
        changeSource: state.changeSource,
        changeTarget: state.changeTarget,
        closeCreate: state.closeCreate,
        submitCreate: state.submitCreate,
        create: {
            isPending: state.create.isPending,
            error: state.create.error,
        },
    };

    return (
        <main id='dictionary-content' tabIndex={-1} className={styles.main}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>
                        {t('dictionary.library.title')}
                    </h1>
                    <p className={styles.subtitle}>
                        {t('dictionary.library.subtitle')}
                    </p>
                </div>
                <div className={styles.actions}>
                    <Button
                        leadingIcon={<Plus aria-hidden size={16} />}
                        onClick={state.openCreate}
                        type='button'
                    >
                        {t('dictionary.library.create')}
                    </Button>
                </div>
            </header>
            <div className={styles.filters}>
                <div
                    aria-label={t('dictionary.library.lifecycle')}
                    className={styles.segments}
                    role='group'
                >
                    <button
                        className={styles.segment}
                        aria-pressed={activeSelected}
                        onClick={state.selectActive}
                        type='button'
                    >
                        {t('dictionary.lifecycle.active')}
                    </button>
                    <button
                        className={styles.segment}
                        id='archived-dictionaries-filter'
                        aria-pressed={archivedSelected}
                        onClick={state.selectArchived}
                        type='button'
                    >
                        {t('dictionary.lifecycle.archived')}
                    </button>
                </div>
                <Input
                    aria-label={t('dictionary.library.search')}
                    leadingIcon={<Search aria-hidden size={16} />}
                    onChange={state.changeSearch}
                    placeholder={t('dictionary.library.search')}
                    size='sm'
                    type='search'
                    value={state.search}
                    wrapperClassName={searchClass}
                />
            </div>
            <p aria-live='polite' className={styles.srOutcome}>
                {state.message}
            </p>
            {errorMessage ? (
                <ErrorState
                    action={conflictAction}
                    title={t('dictionary.error.title')}
                >
                    {errorMessage}
                </ErrorState>
            ) : null}
            {archivedSelected && state.list.length > 0 ? (
                <div>
                    <div className={styles.selectionToolbar}>
                        <Checkbox
                            checked={allLoadedSelected}
                            disabled={
                                !state.list.length ||
                                state.deleteDictionaries.isPending
                            }
                            indeterminate={
                                someLoadedSelected && !allLoadedSelected
                            }
                            label={t('dictionary.deletion.selectLoaded')}
                            onChange={state.toggleAllLoaded}
                        />
                        <span className={styles.selectionCount}>
                            {t('dictionary.deletion.selectedCount', {
                                count: state.selected.size,
                            })}
                        </span>
                        <div className={styles.selectionActions}>
                            <Button
                                disabled={!state.selected.size}
                                leadingIcon={<Trash2 aria-hidden size={16} />}
                                onClick={openSelectedDeletion}
                                size='compact'
                                type='button'
                                variant='danger'
                            >
                                {t('dictionary.deletion.deleteSelected')}
                            </Button>
                            <Button
                                loading={state.deletionPreview.isPending}
                                onClick={state.openAllDeletion}
                                size='compact'
                                type='button'
                                variant='secondary'
                            >
                                {t('dictionary.deletion.deleteAllArchived')}
                            </Button>
                        </div>
                    </div>
                    {state.deletionPreview.error ? (
                        <InlineAlert
                            tone='danger'
                            title={t('dictionary.deletion.failed')}
                        >
                            {dictionaryErrorMessage(
                                state.deletionPreview.error,
                                t,
                            )}
                        </InlineAlert>
                    ) : null}
                    {state.selectionLimitReached ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.deletion.selectionLimit', {
                                count: dictionaryDeletionSelectedTargetLimit,
                            })}
                        </InlineAlert>
                    ) : null}
                </div>
            ) : null}
            <LibraryResults state={resultsView} />
            {state.dictionaries.isFetchNextPageError ? (
                <p role='alert'>{t('dictionary.library.loadMoreFailed')}</p>
            ) : null}
            {state.dictionaries.hasNextPage ? (
                <Button
                    loading={state.dictionaries.isFetchingNextPage}
                    onClick={state.loadMore}
                    type='button'
                    variant='secondary'
                >
                    {loadMoreLabel}
                </Button>
            ) : null}
            <LibraryCreateDialog state={createView} />
            <LibraryDeletionDialog state={state} />
        </main>
    );
}
