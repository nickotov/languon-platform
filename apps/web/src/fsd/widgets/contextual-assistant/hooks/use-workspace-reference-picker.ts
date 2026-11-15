import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { conversationApi } from '@/fsd/entities/conversation';
import type { WorkspaceReferencePickerProps } from '../ui/contextual-assistant/ui/workspace-reference-picker/types';

/** One copied Text selection; opening its view never authorizes a mutation. */
export function useWorkspaceReferencePicker({
    actorId,
    conversationId,
    request,
    onAttach,
    onClose,
    active = true,
}: WorkspaceReferencePickerProps) {
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [passage, setPassage] = useState('');
    const [translation, setTranslation] = useState('');
    const [includeTranslation, setIncludeTranslation] = useState(false);
    const sourceRef = useRef<HTMLTextAreaElement>(null);
    const translationRef = useRef<HTMLTextAreaElement>(null);
    const results = useQuery({
        queryKey: ['workspace-references', actorId, conversationId, query],
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.references(
                    token,
                    conversationId,
                    query,
                    signal,
                ),
            ),
        retry: false,
        enabled: active,
    });
    const detail = useQuery({
        queryKey: ['workspace-reference', actorId, conversationId, selectedId],
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.reference(
                    token,
                    conversationId,
                    selectedId!,
                    signal,
                ),
            ),
        enabled: active && Boolean(selectedId),
        retry: false,
    });
    const reference = detail.data?.reference;
    useEffect(() => {
        setPassage(reference?.content ?? '');
        setTranslation(reference?.translation ?? '');
        setIncludeTranslation(false);
    }, [reference]);

    function search(value: string) {
        setQuery(value);
    }

    function useSourceSelection() {
        const node = sourceRef.current;
        if (!node || node.selectionStart === node.selectionEnd) {
            return;
        }

        setPassage(node.value.slice(node.selectionStart, node.selectionEnd));
    }

    function useFullSource() {
        setPassage(reference?.content ?? '');
    }

    function useTranslationSelection() {
        const node = translationRef.current;
        if (!node || node.selectionStart === node.selectionEnd) {
            return;
        }

        setTranslation(
            node.value.slice(node.selectionStart, node.selectionEnd),
        );
    }

    function useFullTranslation() {
        setTranslation(reference?.translation ?? '');
    }

    function toggleTranslation(event: ChangeEvent<HTMLInputElement>) {
        setIncludeTranslation(event.target.checked);
    }

    function back() {
        setSelectedId(null);
    }

    function attach() {
        if (!reference || !passage.trim()) {
            return;
        }

        const accepted = onAttach({
            id: crypto.randomUUID(),
            kind: 'text-reference',
            label: reference.title,
            content: passage,
            sourceLanguage: reference.sourceLanguage,
            ...(includeTranslation && translation.trim()
                ? {
                      translation,
                      translationLanguage:
                          reference.translationLanguage ?? undefined,
                  }
                : {}),
        });

        if (accepted) {
            onClose();
        }
    }

    return {
        query,
        selectedId,
        setSelectedId,
        sourceRef,
        translationRef,
        passage,
        translation,
        includeTranslation,
        results,
        detail,
        reference,
        search,
        useSourceSelection,
        useFullSource,
        useTranslationSelection,
        useFullTranslation,
        toggleTranslation,
        back,
        attach,
    };
}
