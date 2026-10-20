import type { useKnowledgePageActions } from '../../hooks/use-knowledge-page-actions';
import { useI18n } from '@/fsd/shared/i18n';
import { AlertDialog, Button, DialogActions } from '@/fsd/shared/ui';
import { WorkspaceConflictDialogs } from './workspace-conflict-dialogs';
import { WorkspaceHistory } from './workspace-history';

export function WorkspaceDialogs({
    actions,
}: {
    actions: ReturnType<typeof useKnowledgePageActions>;
}) {
    const { t } = useI18n();
    const { workspace, draft, state, busy, navigation } = actions;
    if (!workspace || !draft) return null;
    return (
        <>
            <WorkspaceConflictDialogs
                workspace={workspace}
                selectedBranchId={draft.branchId}
                onChoose={actions.chooseBranch}
                onSaveCopy={actions.saveCopy}
                onResolve={actions.resolveBranches}
                resolving={busy === 'resolve'}
                proposal={actions.proposalConflict}
                editor={actions.editor}
                onCloseProposal={actions.closeProposal}
                onNewTarget={actions.beginRetarget}
            />
            <WorkspaceHistory
                noteId={workspace.noteId}
                open={actions.historyOpen}
                publishedVersion={workspace.published?.version ?? 0}
                onClose={actions.closeHistory}
                onBeforeRestore={state.flush}
                onRestored={state.reload}
            />
            <AlertDialog
                open={actions.deleting}
                onClose={actions.closeDelete}
                title={t('knowledge.deleteTitle')}
                closeLabel={t('knowledge.cancelDelete')}
                footer={
                    <DialogActions>
                        <Button
                            variant='secondary'
                            onClick={actions.closeDelete}
                        >
                            {t('knowledge.cancelDelete')}
                        </Button>
                        <Button
                            variant='danger'
                            loading={busy === 'delete'}
                            onClick={actions.remove}
                        >
                            {t('knowledge.delete')}
                        </Button>
                    </DialogActions>
                }
            >
                <p>{t('knowledge.deleteHelp')}</p>
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
        </>
    );
}
