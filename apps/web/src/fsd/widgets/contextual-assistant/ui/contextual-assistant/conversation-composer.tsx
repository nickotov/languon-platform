import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import type { ChatPreferences, CopiedAttachment } from '@languon/contracts';
import { CopiedMaterial, conversationCopy } from '@/fsd/entities/conversation';
import { ConversationPreferences } from '@/fsd/features/conversation-preferences';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Textarea } from '@/fsd/shared/ui';
import styles from './contextual-assistant.module.css';

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
    hasDraft,
    useDraft,
    onUseDraft,
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
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    function change(event: ChangeEvent<HTMLTextAreaElement>) {
        onQuestion(event.target.value);
    }
    function key(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (
            event.key === '/' &&
            !event.nativeEvent.isComposing &&
            question === ''
        ) {
            event.preventDefault();
            onContext();
        }
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        if (question.trim() && !busy && !active) onSend();
    }
    function draft(event: ChangeEvent<HTMLInputElement>) {
        onUseDraft(event.target.checked);
    }
    return (
        <form className={styles.composer} onSubmit={submit}>
            <div className={styles.attachments}>
                {attachments.map((attachment) => (
                    <Attachment
                        key={attachment.id}
                        attachment={attachment}
                        onRemove={onRemove}
                    />
                ))}
            </div>
            {hasDraft ? (
                <label>
                    <input
                        type='checkbox'
                        checked={useDraft}
                        onChange={draft}
                    />
                    {copy.draftContext}
                </label>
            ) : (
                <p className={styles.notice}>{copy.savedContext}</p>
            )}
            <Textarea
                label={copy.question}
                value={question}
                onChange={change}
                onKeyDown={key}
                rows={3}
                maxLength={20000}
                disabled={busy}
                dir='auto'
            />
            <ConversationPreferences
                value={preferences}
                onChange={onPreferences}
                disabled={busy || active}
            />
            <div className={styles.toolbar}>
                <Button type='button' variant='quiet' onClick={onDefaults}>
                    {copy.defaults}
                </Button>
                <Button
                    type='button'
                    variant='secondary'
                    onClick={onContext}
                    disabled={attachments.length >= 10 || busy}
                >
                    {copy.addContext}
                </Button>
                {active ? (
                    <Button type='button' variant='secondary' onClick={onStop}>
                        {copy.stop}
                    </Button>
                ) : (
                    <Button
                        type='submit'
                        disabled={!question.trim() || busy}
                        loading={busy}
                    >
                        {copy.send}
                    </Button>
                )}
            </div>
        </form>
    );
}
function Attachment({
    attachment,
    onRemove,
}: {
    attachment: CopiedAttachment;
    onRemove(id: string): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    function remove() {
        onRemove(attachment.id);
    }
    return (
        <div className={styles.attachment}>
            <CopiedMaterial attachment={attachment} />
            <Button
                type='button'
                size='compact'
                variant='quiet'
                onClick={remove}
            >
                {copy.remove}
            </Button>
        </div>
    );
}
