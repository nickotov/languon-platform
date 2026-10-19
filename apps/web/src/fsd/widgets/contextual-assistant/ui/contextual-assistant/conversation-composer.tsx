import {
    useId,
    useEffect,
    useLayoutEffect,
    useRef,
    type ChangeEvent,
    type FormEvent,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import { ArrowUp, Plus, Square, TextSelect } from 'lucide-react';
import type { ChatPreferences, CopiedAttachment } from '@languon/contracts';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { ComposerAttachments } from './composer-attachments';
import { ComposerPreferences } from './composer-preferences';
import { composerCopy } from './composer-copy';
import styles from './composer.module.css';

export function ConversationComposer({
    question,
    onQuestion,
    attachments,
    onRemove,
    preferences,
    onPreferences,
    onDefaults,
    onContext,
    onSend,
    onStop,
    busy,
    active,
    modelControl,
    contextPicker,
    onSelectFromPage,
    contextOpen = false,
}: {
    question: string;
    onQuestion(value: string): void;
    attachments: CopiedAttachment[];
    onRemove(id: string): void;
    preferences: ChatPreferences;
    onPreferences(value: ChatPreferences): void;
    onDefaults(): void;
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
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const text = composerCopy(locale);
    const id = useId();
    const input = useRef<HTMLTextAreaElement>(null);
    const wasContextOpen = useRef(contextOpen);
    useEffect(() => {
        if (wasContextOpen.current && !contextOpen)
            input.current?.focus({ preventScroll: true });
        wasContextOpen.current = contextOpen;
    }, [contextOpen]);
    const canSend = Boolean(question.trim()) && !busy && !active;
    const hint = question.trim() ? text.pendingQuestion : text.continueTyping;
    const hintId = `${id}-hint`;
    useLayoutEffect(() => {
        const node = input.current;
        if (!node) return;
        node.style.height = 'auto';
        node.style.height = `${node.scrollHeight}px`;
    }, [question]);
    function change(event: ChangeEvent<HTMLTextAreaElement>) {
        onQuestion(event.target.value);
    }
    function key(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSend();
        }
        const before = question.slice(0, event.currentTarget.selectionStart);
        if (event.key === '/' && (!before || /\s$/.test(before))) {
            event.preventDefault();
            onContext();
        }
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        if (canSend) onSend();
    }
    return (
        <form className={styles.composer} onSubmit={submit}>
            {contextPicker}
            <ComposerAttachments
                attachments={attachments}
                onRemove={onRemove}
            />
            <div className={styles.inputFrame}>
                <textarea
                    ref={input}
                    id={id}
                    aria-label={copy.question}
                    aria-describedby={active ? hintId : undefined}
                    placeholder={text.placeholder}
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
                            disabled={attachments.length >= 10 || busy}
                        >
                            <Plus size={16} aria-hidden='true' />
                            <span className={styles.desktopLabel}>
                                {text.context}
                            </span>
                            <kbd className={styles.shortcut}>/</kbd>
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
                    {active ? (
                        <button
                            type='button'
                            onClick={onStop}
                            className={styles.stop}
                        >
                            <Square
                                size={12}
                                fill='currentColor'
                                aria-hidden='true'
                            />
                            {copy.stop}
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
            <div className={styles.preferencesRow}>
                <ComposerPreferences
                    value={preferences}
                    onChange={onPreferences}
                    onDefaults={onDefaults}
                    disabled={busy || active}
                />
                {modelControl}
            </div>
        </form>
    );
}
