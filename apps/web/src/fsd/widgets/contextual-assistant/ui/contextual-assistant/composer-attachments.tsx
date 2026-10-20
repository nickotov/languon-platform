import { useState } from 'react';
import { BookA, Clipboard, Quote, X } from 'lucide-react';
import type { CopiedAttachment } from '@languon/contracts';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { composerCopy } from './composer-copy';
import styles from './composer.module.css';

export function ComposerAttachments({
    attachments,
    onRemove,
    workspace = false,
}: {
    attachments: CopiedAttachment[];
    onRemove(id: string): void;
    workspace?: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const text = composerCopy(locale);
    const [expanded, setExpanded] = useState<string | null>(null);
    const open = attachments.find((item) => item.id === expanded);
    if (!attachments.length) return null;
    function toggle(id: string) {
        setExpanded(expanded === id ? null : id);
    }
    return (
        <div className={styles.attachmentTray}>
            <ul className={styles.attachments} aria-label={copy.material}>
                {attachments.map((attachment) => (
                    <AttachmentChip
                        key={attachment.id}
                        attachment={attachment}
                        expanded={expanded === attachment.id}
                        onToggle={toggle}
                        onRemove={onRemove}
                        workspace={workspace}
                    />
                ))}
            </ul>
            {open && <AttachmentPreview attachment={open} />}
            {!workspace && attachments.length >= 10 && (
                <p className={styles.hint}>{text.limit}</p>
            )}
        </div>
    );
}
function AttachmentChip({
    attachment,
    expanded,
    onToggle,
    onRemove,
    workspace,
}: {
    attachment: CopiedAttachment;
    expanded: boolean;
    onToggle(id: string): void;
    onRemove(id: string): void;
    workspace: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    let Icon = workspace ? Clipboard : Quote;
    if (attachment.kind === 'dictionary-card') Icon = BookA;
    const characterCount =
        attachment.kind === 'dictionary-card'
            ? null
            : Array.from(
                  attachment.content +
                      (attachment.kind === 'text-reference'
                          ? (attachment.translation ?? '')
                          : ''),
              ).length;
    const removeLabel = `${copy.remove}: ${attachment.label}`;
    function toggle() {
        onToggle(attachment.id);
    }
    function remove() {
        onRemove(attachment.id);
    }
    return (
        <li
            className={
                workspace ? styles.workspaceAttachment : styles.attachmentChip
            }
        >
            <button
                type='button'
                onClick={toggle}
                aria-expanded={expanded}
                className={styles.attachmentToggle}
            >
                <Icon size={14} aria-hidden='true' />
                <span dir='auto'>{attachment.label}</span>
                {workspace && attachment.kind !== 'dictionary-card' && (
                    <span className={styles.workspaceExcerpt} dir='auto'>
                        {attachment.content}
                    </span>
                )}
            </button>
            {workspace && characterCount !== null && (
                <small className={styles.referenceCount}>
                    {characterCount.toLocaleString(locale)}
                </small>
            )}
            <button
                type='button'
                onClick={remove}
                aria-label={removeLabel}
                className={styles.removeAttachment}
            >
                <X size={14} aria-hidden='true' />
            </button>
        </li>
    );
}
function AttachmentPreview({ attachment }: { attachment: CopiedAttachment }) {
    if (attachment.kind === 'text-reference')
        return (
            <div className={styles.attachmentPreview} dir='auto'>
                <p>{attachment.content}</p>
                {attachment.translation && (
                    <p lang={attachment.translationLanguage}>
                        {attachment.translation}
                    </p>
                )}
            </div>
        );
    if (attachment.kind !== 'dictionary-card')
        return (
            <div className={styles.attachmentPreview} dir='auto'>
                {attachment.content}
            </div>
        );
    const card = attachment.card;
    return (
        <div className={styles.attachmentPreview}>
            <div className={styles.cardHeading}>
                <strong lang={card.sourceLanguage} dir='auto'>
                    {card.source}
                </strong>
                <span>{card.transcription}</span>
            </div>
            <p lang={card.targetLanguage} dir='auto'>
                {card.translation}
            </p>
            {card.definition && (
                <p lang={card.definitionLanguage} dir='auto'>
                    {card.definition}
                </p>
            )}
            {card.example && (
                <blockquote>
                    <p lang={card.exampleLanguage} dir='auto'>
                        {card.example}
                    </p>
                    <p lang={card.exampleTranslationLanguage} dir='auto'>
                        {card.exampleTranslation}
                    </p>
                </blockquote>
            )}
        </div>
    );
}
