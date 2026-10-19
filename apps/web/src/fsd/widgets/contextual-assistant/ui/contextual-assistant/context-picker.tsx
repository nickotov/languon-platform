import { useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CopiedAttachment } from '@languon/contracts';
import {
    CopiedMaterial,
    conversationApi,
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Input, LoadingState, Textarea } from '@/fsd/shared/ui';
import styles from './contextual-assistant.module.css';

export function ContextPicker({
    actorId,
    conversationId,
    request,
    shareKey,
    onAttach,
}: {
    actorId: string;
    conversationId: string;
    request: ConversationSessionRequest;
    shareKey?: string | undefined;
    onAttach(attachment: CopiedAttachment): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const [query, setQuery] = useState('');
    const [copied, setCopied] = useState('');
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
    function attachCopy() {
        if (!copied.trim()) return;
        onAttach({
            id: crypto.randomUUID(),
            label: copy.copied,
            content: copied,
        });
        setCopied('');
    }
    return (
        <section className={styles.composer}>
            <Input
                label={copy.searchContext}
                value={query}
                onChange={search}
                maxLength={200}
            />
            {results.isPending && <LoadingState>{copy.loading}</LoadingState>}
            {results.isError && <p role='alert'>{copy.error}</p>}
            {results.data?.material.length === 0 && <p>{copy.noContext}</p>}
            {results.data?.material.map((material) => (
                <ContextResult
                    key={material.id}
                    material={material}
                    onAttach={onAttach}
                />
            ))}
            <Textarea
                label={copy.pasteMaterial}
                value={copied}
                onChange={changeCopy}
                maxLength={80000}
                rows={3}
                dir='auto'
            />
            <Button
                type='button'
                variant='secondary'
                onClick={attachCopy}
                disabled={!copied.trim()}
            >
                {copy.add}
            </Button>
        </section>
    );
}
function ContextResult({
    material,
    onAttach,
}: {
    material: CopiedAttachment;
    onAttach(attachment: CopiedAttachment): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    function attach() {
        onAttach({ ...material, id: crypto.randomUUID() });
    }
    return (
        <div className={styles.attachment}>
            <CopiedMaterial attachment={material} />
            <Button size='compact' variant='secondary' onClick={attach}>
                {copy.add}
            </Button>
        </div>
    );
}
