import type {
    AdminSentenceLibraryFilters,
    AdminSentenceLibraryItem,
    AdminSentenceLibraryMutationRequest,
    AdminSentenceLibraryOperation,
    SentenceLibrarySelection,
} from '@languon/contracts';
import { useRef, useState } from 'react';

import { adminApi } from '@/shared/api/admin-api';
import { sentenceSelection } from '../lib/sentence-selection';
import { normalizeSentenceError } from './use-sentence-library';

type Confirmation = {
    operation: AdminSentenceLibraryOperation;
    selection: SentenceLibrarySelection;
    count: number;
    operationId: string;
    expiresAt?: string;
};

export function useSentenceMutation(
    userId: string,
    dictionaryId: string,
    onSuccess: () => void,
) {
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [pending, setPending] = useState(false);
    const [snapshotPending, setSnapshotPending] = useState(false);
    const generation = useRef(0);
    const retryBody = useRef<AdminSentenceLibraryMutationRequest | null>(null);

    const close = () => {
        if (pending) return;
        generation.current += 1;
        setConfirmation(null);
        setError(null);
        retryBody.current = null;
    };
    const openSelected = (
        operation: AdminSentenceLibraryOperation,
        items: AdminSentenceLibraryItem[],
        selected: string[],
    ) => {
        retryBody.current = null;
        setError(null);
        setConfirmation({
            operation,
            selection: sentenceSelection(items, selected),
            count: selected.length,
            operationId: crypto.randomUUID(),
        });
    };
    const openAll = async (
        operation: AdminSentenceLibraryOperation,
        query: AdminSentenceLibraryFilters,
    ) => {
        const requestGeneration = ++generation.current;
        retryBody.current = null;
        setError(null);
        setSnapshotPending(true);
        try {
            const snapshot = await adminApi.snapshotSentences(
                userId,
                dictionaryId,
                { operation, query },
            );
            if (generation.current !== requestGeneration) return;
            setConfirmation({
                operation,
                selection: {
                    type: 'all-matching',
                    snapshotToken: snapshot.snapshotToken,
                },
                count: snapshot.matchingCount,
                expiresAt: snapshot.expiresAt,
                operationId: crypto.randomUUID(),
            });
        } catch (caught) {
            if (generation.current === requestGeneration)
                setError(normalizeSentenceError(caught));
        } finally {
            if (generation.current === requestGeneration)
                setSnapshotPending(false);
        }
    };
    const submit = async (reason: string, deletionConfirmed: boolean) => {
        if (!confirmation || pending) return;
        const body: AdminSentenceLibraryMutationRequest = retryBody.current ?? {
            operationId: confirmation.operationId,
            operation: confirmation.operation,
            selection: confirmation.selection,
            reason,
            ...(deletionConfirmed && confirmation.operation === 'delete'
                ? { confirmation: 'delete-archived-examples' as const }
                : {}),
        };
        retryBody.current = body;
        setPending(true);
        setError(null);
        try {
            await adminApi.mutateSentences(userId, dictionaryId, body);
            setConfirmation(null);
            retryBody.current = null;
            onSuccess();
        } catch (caught) {
            setError(normalizeSentenceError(caught));
        } finally {
            setPending(false);
        }
    };
    return {
        confirmation,
        error,
        pending,
        snapshotPending,
        close,
        openSelected,
        openAll,
        submit,
    };
}
