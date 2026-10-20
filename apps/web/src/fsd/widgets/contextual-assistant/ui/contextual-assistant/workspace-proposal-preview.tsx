import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import type {
    WorkspaceProposalAction,
    WorkspaceProposalPreview,
} from '../../types';
import { workspaceProposalLabels } from './workspace-proposal-copy';
import styles from './workspace-proposal.module.css';

function clip(text: string, maximum: number, fromEnd = false) {
    if (text.length <= maximum) return text;
    return fromEnd ? `…${text.slice(-maximum)}` : `${text.slice(0, maximum)}…`;
}

export function WorkspaceProposalPreviewContent({
    action,
    formattedContent,
    preview,
    original,
}: {
    action: WorkspaceProposalAction;
    formattedContent: ReactNode;
    preview: WorkspaceProposalPreview | null;
    original?: string | undefined;
}) {
    const { locale } = useI18n();
    const copy = workspaceProposalLabels[locale];
    if (action === 'replace' && preview?.changed) {
        return (
            <div className={styles.preview}>
                <p className={styles.changed}>
                    <TriangleAlert size={16} aria-hidden='true' />
                    {copy.conflict}
                </p>
                <dl className={styles.comparison}>
                    <div>
                        <dt>{copy.whenAsked}</dt>
                        <dd dir='auto'>{preview.original}</dd>
                    </div>
                    <div>
                        <dt>{copy.now}</dt>
                        <dd dir='auto'>{preview.current}</dd>
                    </div>
                    <div>
                        <dt>{copy.proposed}</dt>
                        <dd dir='auto'>{formattedContent}</dd>
                    </div>
                </dl>
            </div>
        );
    }
    const removed = preview?.original || original;
    return (
        <div className={styles.preview} dir='auto'>
            {action === 'append' && preview && (
                <>
                    <span className={styles.previewLabel}>
                        {copy.currentEnd}
                    </span>
                    <p>{clip(preview.end, 110, true)}</p>
                </>
            )}
            {action === 'insert' && preview && (
                <p>{clip(preview.before, 70, true)}</p>
            )}
            {action === 'replace' && removed && <del>{removed}</del>}
            <div className={styles.addedContent}>{formattedContent}</div>
            {action === 'insert' && preview?.after && (
                <p>{clip(preview.after, 50)}</p>
            )}
        </div>
    );
}
