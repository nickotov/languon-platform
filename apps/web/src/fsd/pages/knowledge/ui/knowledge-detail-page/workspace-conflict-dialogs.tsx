import { useState, type RefObject } from 'react';
import type {
    KnowledgeWorkingBranch,
    KnowledgeWorkspace,
} from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, DialogActions } from '@/fsd/shared/ui';
import type { KnowledgeEditorHandle } from '@/fsd/features/knowledge-notes';
import type { ProposalConflict } from '../../hooks/use-knowledge-page-actions';
import { NotePreview } from './note-preview';
import styles from './knowledge-detail-page.module.css';

export function WorkspaceConflictDialogs({
    workspace,
    selectedBranchId,
    onChoose,
    onSaveCopy,
    onResolve,
    resolving,
    proposal,
    editor,
    onCloseProposal,
    onNewTarget,
}: {
    workspace: KnowledgeWorkspace;
    selectedBranchId: string;
    onChoose(branch: KnowledgeWorkingBranch): void;
    onSaveCopy(): void;
    onResolve(): void;
    resolving: boolean;
    proposal: ProposalConflict | null;
    editor: RefObject<KnowledgeEditorHandle | null>;
    onCloseProposal(): void;
    onNewTarget(): void;
}) {
    const { t, formatDate } = useI18n();
    const [confirmResolve, setConfirmResolve] = useState(false);
    const liveComparison = editor.current?.getTargetComparison(
        proposal?.targetId,
    );
    const hasCurrentTarget = Boolean(liveComparison?.current);
    let comparison = liveComparison ?? null;
    if (!hasCurrentTarget) {
        const original =
            liveComparison?.original ?? proposal?.anchor?.originalText;
        comparison =
            original !== undefined
                ? { original, current: proposal?.currentDocument ?? '' }
                : null;
    }
    function openResolve() {
        setConfirmResolve(true);
    }
    function closeResolve() {
        if (!resolving) setConfirmResolve(false);
    }
    function resolve() {
        onResolve();
        setConfirmResolve(false);
    }
    function appendInstead() {
        if (!proposal) return;
        editor.current?.applyProposal(proposal.text, 'append');
        onCloseProposal();
    }
    return (
        <>
            {workspace.branches.length > 1 && (
                <section
                    className={styles.conflicts}
                    aria-label={t('knowledge.branchConflict')}
                >
                    <h2>{t('knowledge.branchConflict')}</h2>
                    <p>{t('knowledge.branchConflictHelp')}</p>
                    <div className={styles.branchGrid}>
                        {workspace.branches.map((branch) => (
                            <BranchChoice
                                key={branch.id}
                                branch={branch}
                                selected={branch.id === selectedBranchId}
                                onChoose={onChoose}
                                date={formatDate(branch.updatedAt)}
                            />
                        ))}
                    </div>
                    <p>{t('knowledge.manualCombineHelp')}</p>
                    <Button variant='secondary' onClick={onSaveCopy}>
                        {t('knowledge.saveBranchCopy')}
                    </Button>
                    <Button onClick={openResolve} disabled={resolving}>
                        {t('knowledge.resolveBranches')}
                    </Button>
                </section>
            )}
            <Dialog
                open={confirmResolve}
                onClose={closeResolve}
                title={t('knowledge.resolveBranches')}
                closeLabel={t('knowledge.cancel')}
                footer={
                    <DialogActions>
                        <Button variant='secondary' onClick={closeResolve}>
                            {t('knowledge.cancel')}
                        </Button>
                        <Button loading={resolving} onClick={resolve}>
                            {t('knowledge.confirmResolve')}
                        </Button>
                    </DialogActions>
                }
            >
                <p>{t('knowledge.resolveBranchesHelp')}</p>
            </Dialog>
            <Dialog
                open={proposal !== null}
                onClose={onCloseProposal}
                title={t('knowledge.proposalChanged')}
                closeLabel={t('knowledge.cancel')}
                size='large'
                footer={
                    <DialogActions>
                        <Button variant='secondary' onClick={onNewTarget}>
                            {t('knowledge.chooseNewTarget')}
                        </Button>
                        <Button onClick={appendInstead}>
                            {t('knowledge.appendInstead')}
                        </Button>
                    </DialogActions>
                }
            >
                <p>{t('knowledge.proposalChangedHelp')}</p>
                {comparison && (
                    <div className={styles.proposalCompare}>
                        <div>
                            <h3>{t('knowledge.originalTarget')}</h3>
                            <pre>{comparison.original}</pre>
                        </div>
                        <div>
                            <h3>
                                {hasCurrentTarget
                                    ? t('knowledge.currentTarget')
                                    : t('knowledge.currentDocument')}
                            </h3>
                            <pre>{comparison.current}</pre>
                        </div>
                    </div>
                )}
                <h3>{t('knowledge.proposedText')}</h3>
                <pre className={styles.proposedText}>{proposal?.text}</pre>
            </Dialog>
        </>
    );
}

function BranchChoice({
    branch,
    selected,
    onChoose,
    date,
}: {
    branch: KnowledgeWorkingBranch;
    selected: boolean;
    onChoose(branch: KnowledgeWorkingBranch): void;
    date: string;
}) {
    const { t } = useI18n();
    function choose() {
        onChoose(branch);
    }
    return (
        <article className={styles.branch}>
            <h3 dir='auto'>{branch.content.title}</h3>
            <p>{date}</p>
            <NotePreview content={branch.content} />
            <Button
                variant={selected ? 'primary' : 'secondary'}
                disabled={selected}
                onClick={choose}
            >
                {t(
                    selected
                        ? 'knowledge.currentBranch'
                        : 'knowledge.continueBranch',
                )}
            </Button>
        </article>
    );
}
