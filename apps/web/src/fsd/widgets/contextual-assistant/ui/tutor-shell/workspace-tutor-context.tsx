import { FileText } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Tooltip } from '@/fsd/shared/ui';
import { workspaceCopy } from '../../lib/workspace-copy';
import styles from './tutor-shell.module.css';

export function WorkspaceTutorContext({
    title,
    characters = 0,
    limit = 40_000,
}: {
    title?: string | undefined;
    characters?: number | undefined;
    limit?: number | undefined;
}) {
    const { locale } = useI18n();
    const copy = workspaceCopy(locale);
    const over = characters > limit;
    const count = `${characters.toLocaleString(locale)} ${copy.characters}`;
    const document = title?.trim() || copy.document;
    const label = over
        ? `${copy.limit}: ${count} / ${limit.toLocaleString(locale)}`
        : `${copy.sees} ${document} · ${count}`;
    return (
        <div className={styles.workspaceContextRow} data-over-limit={over}>
            <Tooltip content={copy.hint} placement='bottom'>
                <p className={styles.workspaceContext} tabIndex={0}>
                    <FileText size={14} aria-hidden='true' />
                    <span>{label}</span>
                </p>
            </Tooltip>
        </div>
    );
}
