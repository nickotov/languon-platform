import { useId, type ChangeEvent } from 'react';
import { FileInput, ListEnd, Replace } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import type {
    WorkspaceProposalAction,
    WorkspaceProposalPreview,
} from '../../types';
import { workspaceProposalLabels } from './workspace-proposal-copy';
import styles from './workspace-proposal.module.css';

export function WorkspaceProposalModes({
    action,
    onChange,
    pending,
    canInsert,
    canReplace,
    preview,
    original,
}: {
    action: WorkspaceProposalAction;
    onChange(event: ChangeEvent<HTMLInputElement>): void;
    pending: boolean;
    canInsert: boolean;
    canReplace: boolean;
    preview: WorkspaceProposalPreview | null;
    original?: string | undefined;
}) {
    const { locale } = useI18n();
    const id = useId();
    const copy = workspaceProposalLabels[locale];
    let insertDetail = copy.insertDetail;
    if (preview?.before) {
        let before = preview.before;
        if (before.length > 28) before = `…${before.slice(-28)}`;
        insertDetail = copy.insertAfter.replace('{before}', before);
    }
    const originalText = preview?.original || original;
    const replaceDetail = originalText
        ? copy.replaceDetail.replace(
              '{count}',
              originalText.length.toLocaleString(locale),
          )
        : copy.noSelection;
    return (
        <fieldset className={styles.modes} aria-label={copy.heading}>
            <label className={styles.mode}>
                <input
                    type='radio'
                    name={id}
                    value='insert'
                    checked={action === 'insert'}
                    onChange={onChange}
                    disabled={pending || !canInsert}
                    aria-label={copy.insert}
                />
                <FileInput size={16} aria-hidden='true' />
                <span>
                    <span className={styles.modeLabel}>{copy.insert}</span>
                    <small>{insertDetail}</small>
                </span>
            </label>
            <label className={styles.mode}>
                <input
                    type='radio'
                    name={id}
                    value='append'
                    checked={action === 'append'}
                    onChange={onChange}
                    disabled={pending}
                    aria-label={copy.append}
                />
                <ListEnd size={16} aria-hidden='true' />
                <span>
                    <span className={styles.modeLabel}>{copy.append}</span>
                    <small>{copy.appendDetail}</small>
                </span>
            </label>
            <label className={styles.mode}>
                <input
                    type='radio'
                    name={id}
                    value='replace'
                    checked={action === 'replace'}
                    onChange={onChange}
                    disabled={pending || !canReplace}
                    aria-label={copy.replace}
                />
                <Replace size={16} aria-hidden='true' />
                <span>
                    <span className={styles.modeLabel}>{copy.replace}</span>
                    <small>{replaceDetail}</small>
                </span>
            </label>
        </fieldset>
    );
}
