import { Button } from '@/fsd/shared/ui';
import { Plus } from 'lucide-react';
import styles from '../dictionary-editor-common.module.css';
import type { EditorViewFields } from '../../lib/editor-workspace';

export function EditorAddCard({
    model,
}: {
    model: Pick<EditorViewFields, 't' | 'cardMutation' | 'openCardDraft'>;
}) {
    const { t, cardMutation, openCardDraft } = model;

    return (
        <Button
            className={styles.addCardButton}
            desktopIconOnly
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
