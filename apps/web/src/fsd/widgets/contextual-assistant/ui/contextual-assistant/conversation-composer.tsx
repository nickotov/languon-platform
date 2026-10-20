import type { ReactNode } from 'react';
import { ArrowUp, FileText, Plus, Square, TextSelect } from 'lucide-react';
import type { ChatPreferences, CopiedAttachment } from '@languon/contracts';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { useConversationComposerInput } from '../../hooks/use-conversation-composer-input';
import { ComposerAttachments } from './composer-attachments';
import { ComposerPreferences } from './composer-preferences';
import { composerCopy } from './composer-copy';
import { workspaceCopy } from '../../lib/workspace-copy';
import type { WorkspacePendingPassage } from '../../hooks/use-workspace-passage';
import { WorkspacePassagePreview } from './workspace-passage-preview';
import styles from './composer.module.css';

export function ConversationComposer({
    question,
    onQuestion,
    attachments,
    onRemove,
    preferences,
    onPreferences,
    onDefaults,
    defaultsSaved = false,
    onContext,
    onSend,
    onStop,
    busy,
    active,
    modelControl,
    contextPicker,
    onSelectFromPage,
    contextOpen = false,
    workspace = false,
    editorCharacters,
    editorLimit = 40_000,
    workspacePassage,
    onRemoveWorkspacePassage,
}: {
    question: string;
    onQuestion(value: string): void;
    attachments: CopiedAttachment[];
    onRemove(id: string): void;
    preferences: ChatPreferences;
    onPreferences(value: ChatPreferences): void;
    onDefaults(): void;
    defaultsSaved?: boolean;
    onContext(): void;
    onSend(): void;
    onStop(): void;
    busy: boolean;
    active: boolean;
    hasDraft: boolean;
    useDraft: boolean;
    onUseDraft(value: boolean): void;
    modelControl?: ReactNode;
    contextPicker?: ReactNode;
    onSelectFromPage?: (() => void) | undefined;
    contextOpen?: boolean;
    workspace?: boolean;
    editorCharacters?: number | undefined;
    editorLimit?: number | undefined;
    workspacePassage?: WorkspacePendingPassage | null | undefined;
    onRemoveWorkspacePassage?: (() => void) | undefined;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const text = composerCopy(locale);
    const workspaceText = workspaceCopy(locale);
    let placeholder = text.placeholder;
    const hasPassage =
        Boolean(workspacePassage) ||
        attachments.some(
            (attachment) =>
                attachment.kind !== 'text-reference' &&
                attachment.kind !== 'dictionary-card',
        );
    if (workspace)
        placeholder = hasPassage
            ? workspaceText.selection
            : workspaceText.placeholder;
    const documentCount = `${workspaceText.document} ${(editorCharacters ?? 0).toLocaleString(locale)} / ${editorLimit.toLocaleString(locale)}`;
    const overLimit = workspace && (editorCharacters ?? 0) > editorLimit;
    const canSend = Boolean(question.trim()) && !busy && !active && !overLimit;
    const hint = question.trim() ? text.pendingQuestion : text.continueTyping;
    const { id, input, hintId, change, key, submit } =
        useConversationComposerInput({
            question,
            contextOpen,
            canSend,
            workspace,
            onQuestion,
            onContext,
            onSend,
        });
    return (
        <form
            className={styles.composer}
            onSubmit={submit}
            data-workspace={workspace}
        >
            {contextPicker}
            {overLimit && (
                <p role='alert' className={styles.limitError}>
                    {workspaceText.limit}: {documentCount}
                </p>
            )}
            {!workspace && (
                <ComposerAttachments
                    attachments={attachments}
                    onRemove={onRemove}
                />
            )}
            <div className={styles.inputFrame}>
                {workspace && (
                    <span
                        className={styles.documentChip}
                        title={workspaceText.hint}
                    >
                        <FileText size={14} aria-hidden='true' />
                        {workspaceText.document}
                    </span>
                )}
                {workspacePassage && onRemoveWorkspacePassage && (
                    <WorkspacePassagePreview
                        passage={workspacePassage}
                        onRemove={onRemoveWorkspacePassage}
                    />
                )}
                {workspace && (
                    <ComposerAttachments
                        attachments={attachments}
                        onRemove={onRemove}
                        workspace
                    />
                )}
                <textarea
                    ref={input}
                    id={id}
                    aria-label={copy.question}
                    aria-describedby={active ? hintId : undefined}
                    placeholder={placeholder}
                    className={styles.input}
                    value={question}
                    onChange={change}
                    onKeyDown={key}
                    rows={1}
                    maxLength={20000}
                    dir='auto'
                />
                <div className={styles.inputActions}>
                    <div className={styles.contextActions}>
                        <button
                            type='button'
                            className={styles.contextButton}
                            onClick={onContext}
                            aria-label={copy.addContext}
                            aria-expanded={contextOpen}
                            aria-haspopup='dialog'
                            aria-keyshortcuts='/'
                            disabled={
                                (!workspace && attachments.length >= 10) || busy
                            }
                        >
                            <Plus size={16} aria-hidden='true' />
                            {!workspace && (
                                <span className={styles.desktopLabel}>
                                    {text.context}
                                </span>
                            )}
                            {!workspace && (
                                <kbd className={styles.shortcut}>/</kbd>
                            )}
                        </button>
                        {onSelectFromPage && (
                            <button
                                type='button'
                                onClick={onSelectFromPage}
                                className={styles.selectButton}
                            >
                                <TextSelect size={16} aria-hidden='true' />
                                {text.select}
                            </button>
                        )}
                    </div>
                    {workspace && (
                        <ComposerPreferences
                            value={preferences}
                            onChange={onPreferences}
                            onDefaults={onDefaults}
                            defaultsSaved={defaultsSaved}
                            disabled={busy || active}
                            workspace
                            modelControl={modelControl}
                        />
                    )}
                    <span className={styles.actionSpacer} />
                    {active ? (
                        <button
                            type='button'
                            onClick={onStop}
                            className={styles.stop}
                            aria-label={copy.stop}
                        >
                            <Square
                                size={12}
                                fill='currentColor'
                                aria-hidden='true'
                            />
                            {!workspace && copy.stop}
                        </button>
                    ) : (
                        <button
                            type='submit'
                            className={styles.send}
                            aria-label={copy.send}
                            disabled={!canSend}
                        >
                            <ArrowUp size={16} aria-hidden='true' />
                        </button>
                    )}
                </div>
            </div>
            {active && (
                <p id={hintId} className={styles.hint}>
                    {hint}
                </p>
            )}
            {!workspace && (
                <div className={styles.preferencesRow}>
                    <ComposerPreferences
                        value={preferences}
                        onChange={onPreferences}
                        onDefaults={onDefaults}
                        disabled={busy || active}
                    />
                    {modelControl}
                </div>
            )}
        </form>
    );
}
