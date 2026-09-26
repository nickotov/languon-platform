import { BookPlus, Plus } from 'lucide-react';
import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Card, ErrorState, Skeleton } from '@/fsd/shared/ui';
import type {
    DictionarySummary,
    DictionaryLifecycle,
    LanguageCatalogEntry,
} from '@languon/contracts';
import { LibraryDictionaryRow } from '../library-dictionary-row/library-dictionary-row';
import styles from '../dictionary-library/dictionary-library.module.css';

export type LibraryResultsProps = {
    catalog: readonly LanguageCatalogEntry[];
    list: readonly DictionarySummary[];
    lifecycle: DictionaryLifecycle;
    search: string;
    loadError: Error | null;
    pending: boolean;
    disabled: boolean;
    retryLoad(): void;
    openCreate(): void;
    clearSearch(): void;
    switchLifecycle(): void;
    changeLifecycle(input: {
        id: string;
        lifecycle: DictionaryLifecycle;
        version: number;
    }): void;
    selected: ReadonlySet<string>;
    toggleSelected(dictionaryId: string): void;
    openSelectedDeletion(dictionary?: DictionarySummary): void;
};

export function LibraryResults({ state }: { state: LibraryResultsProps }) {
    const { t } = useI18n();
    const alternate = t(
        state.lifecycle === 'active'
            ? 'dictionary.lifecycle.archived'
            : 'dictionary.lifecycle.active',
    );
    const emptyTitle = t(
        state.search
            ? 'dictionary.library.noResults'
            : state.lifecycle === 'archived'
              ? 'dictionary.library.noArchived'
              : 'dictionary.library.empty',
    );
    const emptyHelp = t(
        state.search
            ? 'dictionary.library.noResultsHelp'
            : 'dictionary.library.emptyHelp',
    );
    const firstDictionary = !state.search && state.lifecycle === 'active';
    const emptyClass = firstDictionary
        ? styles.firstDictionary
        : styles.emptyResults;
    const error = state.loadError
        ? dictionaryErrorMessage(state.loadError, t)
        : null;

    if (error)
        return (
            <ErrorState
                action={
                    <Button onClick={state.retryLoad} type='button'>
                        {t('common.retry')}
                    </Button>
                }
                title={t('dictionary.error.title')}
            >
                {error}
            </ErrorState>
        );

    if (state.pending)
        return (
            <ul
                className={styles.list}
                aria-label={t('dictionary.library.loading')}
                aria-busy='true'
            >
                {[0, 1, 2].map((index) => (
                    <li key={index}>
                        <Card variant='outlined' padding='md'>
                            <Skeleton width='40%' height={18} />
                            <Skeleton
                                className={styles.loadingLine}
                                width='60%'
                            />
                            <Skeleton
                                className={styles.loadingLine}
                                width='80%'
                            />
                        </Card>
                    </li>
                ))}
            </ul>
        );

    if (state.list.length === 0)
        return (
            <Card variant='outlined' padding='lg' className={emptyClass}>
                {firstDictionary ? (
                    <span className={styles.emptyIcon}>
                        <BookPlus aria-hidden size={24} />
                    </span>
                ) : null}
                <h2>{emptyTitle}</h2>
                <p>{emptyHelp}</p>
                {firstDictionary ? (
                    <Button
                        leadingIcon={<Plus aria-hidden size={16} />}
                        onClick={state.openCreate}
                        type='button'
                    >
                        {t('dictionary.library.createFirst')}
                    </Button>
                ) : (
                    <div className={styles.emptyActions}>
                        <Button
                            onClick={state.clearSearch}
                            type='button'
                            variant='secondary'
                            size='compact'
                        >
                            {t('dictionary.library.clearSearch')}
                        </Button>
                        <Button
                            onClick={state.switchLifecycle}
                            type='button'
                            variant='secondary'
                            size='compact'
                        >
                            {alternate}
                        </Button>
                    </div>
                )}
            </Card>
        );

    return (
        <ul className={styles.list}>
            {state.list.map((dictionary) => (
                <LibraryDictionaryRow
                    key={dictionary.id}
                    dictionary={dictionary}
                    catalog={state.catalog}
                    disabled={state.disabled}
                    onChangeLifecycle={state.changeLifecycle}
                    selected={state.selected.has(dictionary.id)}
                    onToggleSelected={state.toggleSelected}
                    onDelete={state.openSelectedDeletion}
                />
            ))}
        </ul>
    );
}
