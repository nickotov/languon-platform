import {
    useState,
    useRef,
    useEffect,
    type ChangeEvent,
    type KeyboardEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    BookA,
    Check,
    ClipboardPaste,
    FileText,
    Search,
    X,
} from 'lucide-react';
import type { CopiedAttachment } from '@languon/contracts';
import {
    conversationApi,
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, LoadingState, Textarea } from '@/fsd/shared/ui';
import { composerCopy } from './composer-copy';
import styles from './composer.module.css';

export function ContextPicker({
    actorId,
    conversationId,
    request,
    shareKey,
    onAttach,
    onClose,
    attachments = [],
}: {
    actorId: string;
    conversationId: string;
    request: ConversationSessionRequest;
    shareKey?: string | undefined;
    onAttach(attachment: CopiedAttachment): void;
    onClose?(): void;
    attachments?: CopiedAttachment[];
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const text = composerCopy(locale);
    const [query, setQuery] = useState('');
    const [copied, setCopied] = useState('');
    const [pasteOpen, setPasteOpen] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const limit = attachments.length >= 10;
    const cannotAttach = !copied.trim() || limit;
    useEffect(() => {
        input.current?.focus();
    }, []);
    const results = useQuery({
        queryKey: ['conversation-context', actorId, conversationId, query],
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.context(
                    token,
                    conversationId,
                    query,
                    shareKey,
                    signal,
                ),
            ),
        retry: false,
        gcTime: 0,
    });
    function search(event: ChangeEvent<HTMLInputElement>) {
        setQuery(event.target.value);
    }
    function changeCopy(event: ChangeEvent<HTMLTextAreaElement>) {
        setCopied(event.target.value);
    }
    function togglePaste() {
        setPasteOpen(!pasteOpen);
    }
    function attachCopy() {
        if (cannotAttach) return;
        onAttach({
            id: crypto.randomUUID(),
            label: copy.copied,
            content: copied,
        });
        setCopied('');
        setPasteOpen(false);
    }
    function key(event: KeyboardEvent<HTMLElement>) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            event.preventDefault();
            onClose?.();
        }
        if (event.key === 'Enter' && event.target === input.current)
            event.preventDefault();
    }
    return (
        <section
            className={styles.picker}
            role='dialog'
            aria-label={copy.addContext}
            onKeyDown={key}
        >
            <div className={styles.searchRow}>
                <Search size={16} aria-hidden='true' />
                <input
                    ref={input}
                    className={styles.search}
                    aria-label={copy.searchContext}
                    placeholder={copy.searchContext}
                    value={query}
                    onChange={search}
                    maxLength={200}
                />
                {onClose && (
                    <button
                        type='button'
                        onClick={onClose}
                        aria-label={text.closePicker}
                        className={styles.removeAttachment}
                    >
                        <X size={16} aria-hidden='true' />
                    </button>
                )}
            </div>
            <div className={styles.results}>
                <p className={styles.hint}>{text.fromSource}</p>
                {results.isPending && (
                    <LoadingState>{copy.loading}</LoadingState>
                )}
                {results.isError && (
                    <p role='alert' className={styles.hint}>
                        {copy.error}
                    </p>
                )}
                {results.data?.material.length === 0 && (
                    <p className={styles.hint}>{copy.noContext}</p>
                )}
                {results.data?.material.map((material) => (
                    <ContextResult
                        key={material.id}
                        material={material}
                        onAttach={onAttach}
                        attachments={attachments}
                        limit={limit}
                    />
                ))}
                {limit && <p className={styles.hint}>{text.limit}</p>}
            </div>
            <div className={styles.pasteArea}>
                {pasteOpen ? (
                    <>
                        <Textarea
                            label={copy.pasteMaterial}
                            value={copied}
                            onChange={changeCopy}
                            maxLength={80000}
                            rows={3}
                            dir='auto'
                        />
                        <div className={styles.pasteActions}>
                            <Button
                                type='button'
                                size='compact'
                                variant='quiet'
                                onClick={togglePaste}
                            >
                                {copy.cancel}
                            </Button>
                            <Button
                                type='button'
                                size='compact'
                                onClick={attachCopy}
                                disabled={cannotAttach}
                            >
                                {text.attachCopy}
                            </Button>
                        </div>
                    </>
                ) : (
                    <button
                        type='button'
                        onClick={togglePaste}
                        disabled={limit}
                        className={styles.pasteButton}
                    >
                        <ClipboardPaste size={16} aria-hidden='true' />
                        {text.paste}
                    </button>
                )}
            </div>
        </section>
    );
}
function ContextResult({
    material,
    onAttach,
    attachments,
    limit,
}: {
    material: CopiedAttachment;
    onAttach(attachment: CopiedAttachment): void;
    attachments: CopiedAttachment[];
    limit: boolean;
}) {
    const attached = attachments.some(
        (item) =>
            item.content === material.content && item.label === material.label,
    );
    const disabled = attached || limit;
    const Icon = material.kind === 'dictionary-card' ? BookA : FileText;
    const subtitle =
        material.kind === 'dictionary-card'
            ? material.card.translation
            : material.content;
    function attach() {
        if (!disabled) onAttach({ ...material, id: crypto.randomUUID() });
    }
    return (
        <button
            type='button'
            className={styles.result}
            onClick={attach}
            disabled={disabled}
            aria-pressed={attached}
        >
            <Icon size={16} aria-hidden='true' />
            <span className={styles.resultText}>
                <strong dir='auto'>{material.label}</strong>
                <span dir='auto'>{subtitle}</span>
            </span>
            {attached && <Check size={16} aria-hidden='true' />}
        </button>
    );
}
