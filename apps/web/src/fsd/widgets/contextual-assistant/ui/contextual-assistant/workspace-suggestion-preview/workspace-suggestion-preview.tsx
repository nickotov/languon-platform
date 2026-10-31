import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Eye, X } from 'lucide-react';
import { Button, Dialog, Tooltip } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { workspaceProposalLabels } from '../workspace-proposal-copy';
import styles from './workspace-suggestion-preview.module.css';

/** Pure read-only presentation: never enters review or resolves an editor target. */
export function WorkspaceSuggestionPreview({
    content,
}: {
    content: ReactNode;
}) {
    const { locale } = useI18n();
    const copy = workspaceProposalLabels[locale];
    const [open, setOpen] = useState(false);
    function show() {
        setOpen(true);
    }
    function close() {
        setOpen(false);
    }
    function containEscape(event: KeyboardEvent<HTMLDivElement>) {
        // Preserve native dialog cancel, while the tutor behind it stays open.
        if (open && event.key === 'Escape') event.stopPropagation();
    }
    return (
        <div className={styles.host} onKeyDown={containEscape}>
            <Tooltip content={copy.preview}>
                <Button
                    variant='ghost'
                    size='compact'
                    className={styles.eye}
                    aria-label={copy.preview}
                    onClick={show}
                >
                    <Eye size={16} aria-hidden />
                </Button>
            </Tooltip>
            <Dialog
                open={open}
                onClose={close}
                title={copy.preview}
                closeLabel={copy.close}
                showHeader={false}
                size='large'
                className={styles.dialog}
                bodyClassName={styles.body}
            >
                <div className={styles.header}>
                    <h2 className={styles.title}>{copy.preview}</h2>
                    <Tooltip content={copy.close}>
                        <Button
                            variant='ghost'
                            size='compact'
                            className={styles.close}
                            aria-label={copy.close}
                            onClick={close}
                        >
                            <X size={20} aria-hidden />
                        </Button>
                    </Tooltip>
                </div>
                <div
                    className={styles.document}
                    role='document'
                    aria-label={copy.proposed}
                    tabIndex={0}
                >
                    {content}
                </div>
            </Dialog>
        </div>
    );
}
