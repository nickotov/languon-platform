import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { Button, ButtonLink, ErrorState } from '@/fsd/shared/ui';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../dictionary-editor/dictionary-editor.module.css';

export function EditorLoadError({
    model,
    error,
}: {
    model: Pick<
        EditorViewFields,
        'dictionary' | 'languages' | 'cards' | 't' | 'href'
    >;
    error: unknown;
}) {
    const { t, href, dictionary, languages, cards } = model;

    const missing =
        error instanceof DictionaryApiError &&
        error.detail.code === 'dictionary_not_found';

    const title = t(
        missing ? 'dictionary.unavailable' : 'dictionary.error.title',
    );

    const message = missing
        ? t('dictionary.unavailableHelp')
        : dictionaryErrorMessage(error, t);

    const libraryHref = href('/dictionaries');

    function reload() {
        void dictionary.refetch();
        void languages.refetch();
        void cards.refetch();
    }

    const action = missing ? (
        <ButtonLink href={libraryHref}>
            {t('dictionary.backToLibrary')}
        </ButtonLink>
    ) : (
        <Button type='button' onClick={reload}>
            {t('common.retry')}
        </Button>
    );

    return (
        <main id='dictionary-content' tabIndex={-1} className={styles.main}>
            <ErrorState title={title} action={action}>
                {message}
            </ErrorState>
        </main>
    );
}
