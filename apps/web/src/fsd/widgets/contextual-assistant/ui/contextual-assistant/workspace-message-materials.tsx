import { Clipboard, TextQuote } from 'lucide-react';
import type { CopiedAttachment } from '@languon/contracts';
import { CopiedMaterial, conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './workspace-message-materials.module.css';

export function WorkspaceMessagePassage({ content }: { content: string }) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    return (
        <details className={styles.material}>
            <summary>
                <span className={styles.label}>
                    <TextQuote size={14} aria-hidden='true' />
                    {copy.selection}
                </span>
                <span className={styles.excerpt} dir='auto'>
                    {content}
                </span>
            </summary>
            <div className={styles.full} dir='auto'>
                {content}
            </div>
        </details>
    );
}

export function WorkspaceMessageMaterials({
    attachments,
}: {
    attachments: CopiedAttachment[];
}) {
    return attachments.map((attachment) => {
        if (attachment.kind === 'dictionary-card')
            return (
                <CopiedMaterial key={attachment.id} attachment={attachment} />
            );
        const reference = attachment.kind === 'text-reference';
        const Icon = reference ? Clipboard : TextQuote;
        return (
            <details
                className={styles.material}
                key={attachment.id}
                data-reference={reference}
            >
                <summary>
                    <span className={styles.label}>
                        <Icon size={14} aria-hidden='true' />
                        {attachment.label}
                    </span>
                    <span className={styles.excerpt} dir='auto'>
                        {attachment.content}
                    </span>
                </summary>
                <div className={styles.full} dir='auto'>
                    {attachment.content}
                </div>
                {reference && attachment.translation && (
                    <div
                        className={styles.full}
                        lang={attachment.translationLanguage}
                        dir='auto'
                    >
                        {attachment.translation}
                    </div>
                )}
            </details>
        );
    });
}
