'use client';

import { Plus, Search } from 'lucide-react';
import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ErrorState, Input } from '@/fsd/shared/ui';
import { useDictionaryLibrary } from '../../hooks/use-dictionary-library';
import type { DictionaryLibraryProps } from '../../types';
import { LibraryCreateDialog } from '../library-create-dialog/library-create-dialog';
import { LibraryResults } from '../library-results/library-results';
import styles from './dictionary-library.module.css';

export function DictionaryLibrary({
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
    const conflictAction = conflict ? (
        <Button onClick={state.reloadConflict} type='button'>
            {t('dictionary.conflict.reload')}
        </Button>
    ) : undefined;
    const loadMoreLabel = t(
        state.dictionaries.isFetchNextPageError
            ? 'dictionary.library.retryLoadMore'
            : 'dictionary.library.loadMore',
    );

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
                    <h1>{t('dictionary.library.title')}</h1>
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
                        aria-pressed={activeSelected}
                        onClick={state.selectActive}
                        type='button'
                    >
                        {t('dictionary.lifecycle.active')}
                    </button>
                    <button
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
        </main>
    );
}
