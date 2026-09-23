import { Button } from '@/fsd/shared/ui';
import { Plus } from 'lucide-react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../dictionary-editor/dictionary-editor.module.css';

export function EditorAddCard({
    model,
}: {
    model: Pick<EditorViewFields, 't' | 'cardMutation' | 'openCardDraft'>;
}) {
    const { t, cardMutation, openCardDraft } = model;

    return (
        <Button
            className={styles.addCard}
            leadingIcon={<Plus size={20} aria-hidden />}
            disabled={cardMutation.isPending}
            onClick={openCardDraft}
            size='large'
            type='button'
        >
            {t('dictionary.cards.add')}
        </Button>
    );
}
