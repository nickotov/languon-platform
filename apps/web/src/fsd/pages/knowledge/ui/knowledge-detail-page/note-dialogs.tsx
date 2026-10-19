import { KnowledgeApiError } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import type { useDirtyNavigation } from '@/fsd/shared/lib/navigation/use-dirty-navigation';
import {
    AlertDialog,
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
} from '@/fsd/shared/ui';
import type { useKnowledgeNote } from '../../hooks/use-knowledge-note';
import { NotePreview } from './note-preview';

type Props = {
    state: ReturnType<typeof useKnowledgeNote>;
    navigation: ReturnType<typeof useDirtyNavigation>;
    deleting: boolean;
    compare: boolean;
    onDeleting(value: boolean): void;
    onCompare(value: boolean): void;
    onDelete(): void;
    onValidity(valid: boolean): void;
};

export function NoteDialogs({
    state,
    navigation,
    deleting,
    compare,
    onDeleting,
    onCompare,
    onDelete,
    onValidity,
}: Props) {
    const { t } = useI18n();
    const note = state.query.data;
    function closeDelete() {
        if (!state.remove.isPending) onDeleting(false);
    }
    function closeCompare() {
        onCompare(false);
    }
    function useLatest() {
        onCompare(false);
        navigation.request(() => {
            if (!note) return;
            onValidity(true);
            state.startEditing(note);
        });
    }
    const deletionConflict =
        state.remove.error instanceof KnowledgeApiError &&
        state.remove.error.status === 409;
    return (
        <>
            <AlertDialog
                open={deleting}
                onClose={closeDelete}
                title={t('knowledge.deleteTitle')}
                dismissible={!state.remove.isPending}
                closeLabel={t('knowledge.cancelDelete')}
                footer={
                    <DialogActions>
                        <Button
                            variant='secondary'
                            disabled={state.remove.isPending}
                            onClick={closeDelete}
                        >
                            {t('knowledge.cancelDelete')}
                        </Button>
                        <Button
                            variant='danger'
                            loading={state.remove.isPending}
                            onClick={onDelete}
                        >
                            {t(
                                state.remove.isPending
                                    ? 'knowledge.deleting'
                                    : 'knowledge.delete',
                            )}
                        </Button>
                    </DialogActions>
                }
            >
                <p>{t('knowledge.deleteHelp')}</p>
                {state.remove.isError && (
                    <InlineAlert tone='error'>
                        {t(
                            deletionConflict
                                ? 'knowledge.conflict'
                                : 'knowledge.saveError',
                        )}
                    </InlineAlert>
                )}
            </AlertDialog>
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
                open={compare}
                onClose={closeCompare}
                title={t('knowledge.latest')}
                closeLabel={t('knowledge.cancel')}
                size='large'
                footer={
                    <DialogActions>
                        <Button variant='secondary' onClick={closeCompare}>
                            {t('knowledge.keepEditing')}
                        </Button>
                        <Button onClick={useLatest}>
                            {t('knowledge.useLatest')}
                        </Button>
                    </DialogActions>
                }
            >
                {note && (
                    <>
                        <h2>{note.title}</h2>
                        <NotePreview content={note} />
                    </>
                )}
            </Dialog>
        </>
    );
}
