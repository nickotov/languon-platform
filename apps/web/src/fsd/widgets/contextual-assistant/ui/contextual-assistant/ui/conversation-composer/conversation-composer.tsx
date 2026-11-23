import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { BlockReferenceChips } from '../block-reference-controls';
import { blockReferenceCopy } from '../../../../lib/block-reference-copy';
import { useState, type ReactNode } from 'react';
import type {
    ConversationPromptMention,
    ExerciseActivityId,
} from '@languon/contracts';
import type { PromptValue } from '../../../../lib/prompt-document';
import { WorkspacePromptInput } from '../workspace-prompt-input/workspace-prompt-input';
import {
    ArrowUp,
    FileText,
    Headphones,
    ListChecks,
    Plus,
    Square,
    TextSelect,
    X,
} from 'lucide-react';
import type {
    ChatPreferences,
    CopiedAttachment,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import { exerciseGenerationCopy } from '@/fsd/features/knowledge-notes';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Popover, PopoverTrigger, Tooltip } from '@/fsd/shared/ui';
import { useConversationComposerInput } from '../../../../hooks/use-conversation-composer-input';
import { ComposerAttachments } from '../composer-attachments/composer-attachments';
import { ComposerPreferences } from '../composer-preferences/composer-preferences';
import { composerCopy } from '../../composer-copy';
import { workspaceCopy } from '../../../../lib/workspace-copy';
import type { WorkspacePendingPassage } from '../../../../hooks/use-workspace-passage';
import { WorkspacePassagePreview } from '../workspace-passage-preview/workspace-passage-preview';
import styles from '../../../styles/contextual-assistant-composer-common.module.css';

export function ConversationComposer({
    question,
    promptMentions = [],
    onPromptChange,
    externalRequest,
    onCloseContext,
    onQuestion,
    attachments,
    onRemove,
    preferences,
    portrait,
    onPreferences,
    onDefaults,
    defaultsSaved = false,
    onContext,
    onSend,
    onStop,
    stopDisabled,
    busy,
    active,
    contextPicker,
    onSelectFromPage,
    contextOpen = false,
    workspace = false,
    editorCharacters,
    editorLimit = 40_000,
    blockReferences = [],
    availableBlocks = [],
    onRemoveBlockReference,
    blockReferenceLimitReached = false,
    missingBlockReference = false,
    workspacePassage,
    onRemoveWorkspacePassage,
    onGenerateExercises,
    includeListeningSpeech = false,
    onToggleListeningSpeech,
    exerciseRequest,
    onClearExerciseRequest,
}: {
    question: string;
    promptMentions?: ConversationPromptMention[];
    onPromptChange?: ((value: PromptValue) => void) | undefined;
    externalRequest?:
        | { id: string; exerciseActivityId?: ExerciseActivityId | undefined }
        | undefined;
    onCloseContext?: (() => void) | undefined;
    onQuestion(value: string): void;
    attachments: CopiedAttachment[];
    onRemove(id: string): void;
    preferences: ChatPreferences;
    portrait?: Parameters<typeof ComposerPreferences>[0]['portrait'];
    onPreferences(value: ChatPreferences): void;
    onDefaults(): void;
    defaultsSaved?: boolean;
    onContext(): void;
    onSend(): void;
    onStop(): void;
    stopDisabled?: boolean;
    busy: boolean;
    active: boolean;
    hasDraft: boolean;
    useDraft: boolean;
    onUseDraft(value: boolean): void;
    contextPicker?: ReactNode;
    onSelectFromPage?: (() => void) | undefined;
    contextOpen?: boolean;
    workspace?: boolean;
    editorCharacters?: number | undefined;
    editorLimit?: number | undefined;
    blockReferences?: KnowledgeBlockReference[] | undefined;
    availableBlocks?: KnowledgeBlockReference[] | undefined;
    onRemoveBlockReference?: ((id: string) => void) | undefined;
    blockReferenceLimitReached?: boolean | undefined;
    missingBlockReference?: boolean | undefined;
    workspacePassage?: WorkspacePendingPassage | null | undefined;
    onRemoveWorkspacePassage?: (() => void) | undefined;
    includeListeningSpeech?: boolean;
    onToggleListeningSpeech?: (() => void) | undefined;
    onGenerateExercises?: (() => void) | undefined;
    exerciseRequest?: SubmitConversationTurnRequest['exerciseRequest'];
    onClearExerciseRequest?: (() => void) | undefined;
}) {
    const [previewOpen, setPreviewOpen] = useState(false);
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const text = composerCopy(locale);
    const workspaceText = workspaceCopy(locale);
    const exerciseText = exerciseGenerationCopy(locale);
    let placeholder = text.placeholder;
    const hasPassage =
        Boolean(workspacePassage) ||
        attachments.some(
            (attachment) =>
                attachment.kind !== 'text-reference' &&
                attachment.kind !== 'dictionary-card',
        );

    if (workspace) {
        placeholder = hasPassage
            ? workspaceText.selection
            : workspaceText.placeholder;
    }

    const documentCount = `${workspaceText.document} ${(editorCharacters ?? 0).toLocaleString(locale)} / ${editorLimit.toLocaleString(locale)}`;
    const overLimit = workspace && (editorCharacters ?? 0) > editorLimit;
    const canSend =
        Boolean(question.trim()) &&
        !busy &&
        !active &&
        !overLimit &&
        !missingBlockReference;
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

    function changeContextOpen(next: boolean) {
        if (next) {
            onContext();
        } else if (!previewOpen) {
            if (onCloseContext) {
                onCloseContext();
            } else {
                onContext();
            }
        }
    }

    const contextButton = (
        <button
            type='button'
            className={styles.contextButton}
            onClick={workspace ? undefined : onContext}
            aria-label={copy.addContext}
            aria-expanded={contextOpen}
            aria-haspopup='dialog'
            aria-keyshortcuts='/'
            disabled={(!workspace && attachments.length >= 10) || busy}
        >
            <Plus size={16} aria-hidden='true' />
            {!workspace && (
                <span className={styles.desktopLabel}>{text.context}</span>
            )}
            {!workspace && <kbd className={styles.shortcut}>/</kbd>}
        </button>
    );

    const composer = (
        <form
            className={styles.composer}
            onSubmit={submit}
            data-workspace={workspace}
        >
            {!workspace && contextPicker}
            {blockReferenceLimitReached && (
                <p role='alert'>{blockReferenceCopy(locale).limit}</p>
            )}
            {missingBlockReference && (
                <p role='alert'>{blockReferenceCopy(locale).missing}</p>
            )}
            {exerciseRequest && (
                <div className={styles.documentChip} role='status'>
                    <ListChecks size={14} aria-hidden='true' />
                    <span>
                        {exerciseText.title} · {exerciseRequest.count}
                    </span>
                    <button
                        type='button'
                        onClick={onClearExerciseRequest}
                        aria-label={copy.remove}
                    >
                        <X size={14} aria-hidden='true' />
                    </button>
                </div>
            )}
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
                {!workspace && onRemoveBlockReference && (
                    <BlockReferenceChips
                        selected={blockReferences}
                        available={availableBlocks}
                        onRemove={onRemoveBlockReference}
                    />
                )}
                {workspace && onPromptChange && onCloseContext ? (
                    <WorkspacePromptInput
                        content={question}
                        mentions={promptMentions}
                        onChange={onPromptChange}
                        label={copy.question}
                        locale={locale}
                        canSend={canSend}
                        onSend={onSend}
                        contextOpen={contextOpen}
                        onPreviewOpenChange={setPreviewOpen}
                        contextDisabled={busy}
                        onContext={onContext}
                        onClose={onCloseContext}
                        texts={contextPicker}
                        blocks={availableBlocks}
                        selectedBlocks={blockReferences}
                        externalRequest={externalRequest}
                        exerciseRequest={exerciseRequest}
                    />
                ) : (
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
                )}
                <div className={styles.inputActions}>
                    <div className={styles.contextActions}>
                        <Tooltip
                            content={copy.addContext}
                            desktopOnly
                            disabled={!workspace}
                            triggerClassName={styles.iconTooltipTrigger}
                        >
                            {workspace ? (
                                <PopoverTrigger asChild>
                                    {contextButton}
                                </PopoverTrigger>
                            ) : (
                                contextButton
                            )}
                        </Tooltip>
                        <ComposerPreferences
                            value={preferences}
                            portrait={portrait}
                            onChange={onPreferences}
                            onDefaults={onDefaults}
                            defaultsSaved={workspace && defaultsSaved}
                            disabled={busy}
                            workspace={workspace}
                        />
                        {onGenerateExercises && (
                            <button
                                type='button'
                                onClick={onGenerateExercises}
                                className={styles.exerciseButton}
                                disabled={busy || active}
                            >
                                <ListChecks size={16} aria-hidden='true' />
                                {exerciseText.title}
                            </button>
                        )}
                        {onToggleListeningSpeech && (
                            <Tooltip
                                content={text.recordingHint}
                                triggerClassName={styles.iconTooltipTrigger}
                            >
                                <button
                                    type='button'
                                    className={styles.exerciseButton}
                                    aria-pressed={includeListeningSpeech}
                                    onClick={onToggleListeningSpeech}
                                    disabled={busy || active}
                                >
                                    <Headphones size={16} aria-hidden='true' />
                                    {text.newRecording}
                                </button>
                            </Tooltip>
                        )}
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
                    <span className={styles.actionSpacer} />
                    {active ? (
                        <Tooltip
                            content={copy.stop}
                            desktopOnly
                            disabled={!workspace}
                            triggerClassName={styles.iconTooltipTrigger}
                        >
                            <button
                                type='button'
                                onClick={onStop}
                                disabled={stopDisabled}
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
                        </Tooltip>
                    ) : (
                        <Tooltip
                            content={copy.send}
                            desktopOnly
                            triggerClassName={styles.iconTooltipTrigger}
                        >
                            <button
                                type='submit'
                                className={styles.send}
                                aria-label={copy.send}
                                disabled={!canSend}
                            >
                                <ArrowUp size={16} aria-hidden='true' />
                            </button>
                        </Tooltip>
                    )}
                </div>
            </div>
            {active && (
                <p id={hintId} className={styles.hint}>
                    {hint}
                </p>
            )}
        </form>
    );

    return workspace ? (
        <Popover open={contextOpen} onOpenChange={changeContextOpen}>
            {composer}
        </Popover>
    ) : (
        composer
    );
}
