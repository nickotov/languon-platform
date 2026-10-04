import { Button } from '@/fsd/shared/ui';
import { Plus, Sparkles } from 'lucide-react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../dictionary-editor-common.module.css';

export function EditorEmptyCards({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'current'
        | 'search'
        | 'cardLifecycle'
        | 'setSearch'
        | 'openCardDraft'
    >;
}) {
    const { t, current, search, cardLifecycle, setSearch, openCardDraft } =
        model;

    const query = search.trim();

    const emptyDictionary =
        !query && cardLifecycle === 'active' && current.activeCardCount === 0;

    function resolveTitle() {
        if (emptyDictionary) {
            return t('dictionary.editor.noCardsTitle');
        }

        if (query) {
            return t('dictionary.editor.noCardsMatch', {
                lifecycle: t(`dictionary.lifecycle.${cardLifecycle}`),
                query,
            });
        }

        return t('dictionary.cards.empty');
    }

    const title = resolveTitle();

    function resolveHelp() {
        if (emptyDictionary) {
            return t('dictionary.editor.noCardsHelp', { name: current.name });
        }

        if (query) {
            return t('dictionary.editor.searchHelp');
        }

        return null;
    }

    const help = resolveHelp();

    const canAdd = current.lifecycle === 'active' && emptyDictionary;

    function clearSearch() {
        setSearch('');
    }

    function resolveEditorEmptyCardsContent() {
        if (canAdd) {
            return (
                <Button
                    className={styles.emptyAction}
                    leadingIcon={<Plus size={16} aria-hidden />}
                    onClick={openCardDraft}
                >
                    {t('dictionary.editor.addFirstCard')}
                </Button>
            );
        }

        if (query) {
            return (
                <Button
                    className={styles.emptyAction}
                    variant='secondary'
                    onClick={clearSearch}
                >
                    {t('dictionary.editor.clearSearch')}
                </Button>
            );
        }

        return null;
    }

    const resolvedEditorEmptyCardsContent = resolveEditorEmptyCardsContent();

    return (
        <div className={emptyDictionary ? styles.emptyCards : styles.noMatches}>
            {emptyDictionary ? (
                <span className={styles.emptyIcon}>
                    <Sparkles size={24} aria-hidden />
                </span>
            ) : null}
            <h2 className={styles.emptyTitle}>{title}</h2>
            {help ? <p className={styles.emptyHelp}>{help}</p> : null}
            {resolvedEditorEmptyCardsContent}
        </div>
    );
}
