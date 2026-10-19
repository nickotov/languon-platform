import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { AlertDialog, Button, Dialog, DialogActions } from '@/fsd/shared/ui';
import type { useAssistantNavigation } from '../../hooks/use-assistant-navigation';
import styles from './contextual-assistant.module.css';

export function AssistantDialogs({
    navigation,
    deleting,
    onCancelDelete,
    onConfirmDelete,
}: {
    navigation: ReturnType<typeof useAssistantNavigation>['navigation'];
    deleting: boolean;
    onCancelDelete(): void;
    onConfirmDelete(): void;
}) {
    const { locale, t } = useI18n();
    const copy = conversationCopy(locale);
    return (
        <>
            <AlertDialog
                open={navigation.open}
                onClose={navigation.keepEditing}
                title={t('knowledge.unsavedTitle')}
                closeLabel={t('knowledge.keepEditing')}
                footer={
                    <DialogActions>
                        <Button
                            variant='secondary'
                            onClick={navigation.keepEditing}
                        >
                            {t('knowledge.keepEditing')}
                        </Button>
                        <Button variant='danger' onClick={navigation.discard}>
                            {t('knowledge.discard')}
                        </Button>
                    </DialogActions>
                }
            >
                <p>{t('knowledge.unsavedHelp')}</p>
            </AlertDialog>
            <Dialog
                open={deleting}
                title={copy.deleteChat}
                onClose={onCancelDelete}
                closeLabel={copy.cancel}
            >
                <p>{copy.confirmDelete}</p>
                <div className={styles.toolbar}>
                    <Button variant='danger' onClick={onConfirmDelete}>
                        {copy.delete}
                    </Button>
                    <Button variant='secondary' onClick={onCancelDelete}>
                        {copy.cancel}
                    </Button>
                </div>
            </Dialog>
        </>
    );
}
