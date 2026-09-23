import { Button, Dialog } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';

export function EditorDiscardDialog({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'confirmCardDiscard'
        | 'setConfirmCardDiscard'
        | 'discardCardDraft'
    >;
}) {
    const { t, confirmCardDiscard, setConfirmCardDiscard, discardCardDraft } =
        model;

    const handleClose: ComponentProps<typeof Dialog>['onClose'] = () =>
        setConfirmCardDiscard(false);

    const handleClick: ComponentProps<typeof Button>['onClick'] = () =>
        setConfirmCardDiscard(false);

    return (
        <Dialog
            open={confirmCardDiscard}
            onClose={handleClose}
            closeLabel={t('common.cancel')}
            title={t('dictionary.card.discardTitle')}
            description={t('dictionary.card.discardDescription')}
            footer={
                <>
                    <Button
                        type='button'
                        variant='secondary'
                        onClick={handleClick}
                    >
                        {t('dictionary.card.keepWriting')}
                    </Button>
                    <Button
                        type='button'
                        variant='danger'
                        onClick={discardCardDraft}
                    >
                        {t('dictionary.card.discardDraft')}
                    </Button>
                </>
            }
        >
            <p>{t('dictionary.card.discardHelp')}</p>
        </Dialog>
    );
}
