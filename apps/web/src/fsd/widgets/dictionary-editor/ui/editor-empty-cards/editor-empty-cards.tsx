import { Button } from '@/fsd/shared/ui';
import { Plus, Sparkles } from 'lucide-react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../dictionary-editor/dictionary-editor.module.css';

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

    const title = emptyDictionary
        ? t('dictionary.editor.noCardsTitle')
        : query
          ? t('dictionary.editor.noCardsMatch', {
                lifecycle: t(`dictionary.lifecycle.${cardLifecycle}`),
                query,
            })
          : t('dictionary.cards.empty');

    const help = emptyDictionary
        ? t('dictionary.editor.noCardsHelp', { name: current.name })
        : query
          ? t('dictionary.editor.searchHelp')
          : null;

    const canAdd = current.lifecycle === 'active' && emptyDictionary;

    function clearSearch() {
        setSearch('');
    }

    return (
        <div className={emptyDictionary ? styles.emptyCards : styles.noMatches}>
            {emptyDictionary ? (
                <span className={styles.emptyIcon}>
                    <Sparkles size={24} aria-hidden />
                </span>
            ) : null}
            <h2 className={styles.emptyTitle}>{title}</h2>
            {help ? <p className={styles.emptyHelp}>{help}</p> : null}
            {canAdd ? (
                <Button
                    className={styles.emptyAction}
                    leadingIcon={<Plus size={16} aria-hidden />}
                    onClick={openCardDraft}
                >
                    {t('dictionary.editor.addFirstCard')}
                </Button>
            ) : query ? (
                <Button
                    className={styles.emptyAction}
                    variant='secondary'
                    onClick={clearSearch}
                >
                    {t('dictionary.editor.clearSearch')}
                </Button>
            ) : null}
        </div>
    );
}
