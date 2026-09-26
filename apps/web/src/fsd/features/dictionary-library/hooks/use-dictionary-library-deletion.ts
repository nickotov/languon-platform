import type { DictionarySummary } from '@languon/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
    dictionaryApi,
    toggleDeletionTarget,
    toggleLoadedDeletionTargets,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';

import { retainIdempotencyAttempt } from '../lib/idempotency-attempt';
import { removeDeletedDictionaryCaches } from '../lib/dictionary-deletion-cache';

type DictionaryDeletion =
    | { kind: 'selected'; targets: readonly DictionarySummary[] }
    | { kind: 'all'; count: number; snapshot: string };

export function useDictionaryLibraryDeletion({
    list,
    refetchDictionaries,
    requestWithSession,
    setMessage,
}: {
    list: readonly DictionarySummary[];
    refetchDictionaries(): Promise<unknown>;
    requestWithSession: RequestWithSession;
    setMessage(message: string): void;
}) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [selectionLimitReached, setSelectionLimitReached] = useState(false);
    const [deletion, setDeletion] = useState<DictionaryDeletion | null>(null);
    const [deletionConfirmation, setDeletionConfirmation] = useState('');
    const deletionAttempt = useRef<{
        fingerprint: string;
        key: string;
    } | null>(null);

    const deletionPreview = useMutation({
        mutationFn: () =>
            requestWithSession((token) =>
                dictionaryApi.previewDictionaryDeletion(token),
            ),
        onSuccess: (preview) => {
            if (preview.eligibleCount > 0) {
                setDeletion({
                    kind: 'all',
                    count: preview.eligibleCount,
                    snapshot: preview.snapshot,
                });
                setDeletionConfirmation('');
            } else {
                setMessage(t('dictionary.deletion.noneAvailable'));
            }
        },
    });

    const deleteDictionaries = useMutation({
        mutationFn: () => {
            if (!deletion) throw new Error('Deletion unavailable');
            const body =
                deletion.kind === 'all'
                    ? {
                          scope: {
                              kind: 'all-archived' as const,
                              snapshot: deletion.snapshot,
                          },
                      }
                    : {
                          scope: {
                              kind: 'selected' as const,
                              targets: deletion.targets.map((dictionary) => ({
                                  dictionaryId: dictionary.id,
                                  expectedVersion: dictionary.version,
                              })),
                          },
                      };
            const fingerprint = JSON.stringify(body);
            deletionAttempt.current = retainIdempotencyAttempt(
                deletionAttempt.current,
                fingerprint,
            );
            return requestWithSession((token) =>
                dictionaryApi.deleteDictionaries(
                    token,
                    body,
                    deletionAttempt.current!.key,
                ),
            );
        },
        onSuccess: async (receipt) => {
            const deletedDictionaryIds =
                deletion?.kind === 'selected'
                    ? new Set(
                          deletion.targets.map((dictionary) => dictionary.id),
                      )
                    : 'all';
            removeDeletedDictionaryCaches(queryClient, deletedDictionaryIds);
            deletionAttempt.current = null;
            setDeletion(null);
            setDeletionConfirmation('');
            clearSelection();
            setMessage(
                t('dictionary.deletion.dictionariesDeleted', {
                    count: receipt.deletedCount,
                }),
            );
            await queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            document.getElementById('archived-dictionaries-filter')?.focus();
        },
    });

    function clearSelection() {
        setSelected(new Set());
        setSelectionLimitReached(false);
    }

    function toggleSelected(dictionaryId: string) {
        const update = toggleDeletionTarget(selected, dictionaryId);
        setSelected(update.selected);
        setSelectionLimitReached(update.limitReached);
    }

    function toggleAllLoaded() {
        const update = toggleLoadedDeletionTargets(
            selected,
            list.map((dictionary) => dictionary.id),
        );
        setSelected(update.selected);
        setSelectionLimitReached(update.limitReached);
    }

    function openSelectedDeletion(dictionary?: DictionarySummary) {
        const targets = dictionary
            ? [dictionary]
            : list.filter((entry) => selected.has(entry.id));
        if (!targets.length) return;
        deleteDictionaries.reset();
        setDeletion({ kind: 'selected', targets });
        setDeletionConfirmation('');
    }

    function openAllDeletion() {
        deleteDictionaries.reset();
        deletionPreview.mutate();
    }

    function closeDeletion() {
        if (deleteDictionaries.isPending) return;
        setDeletion(null);
        setDeletionConfirmation('');
        deleteDictionaries.reset();
    }

    async function reloadDeletionConflict() {
        closeDeletion();
        clearSelection();
        await refetchDictionaries();
    }

    return {
        selected,
        selectionLimitReached,
        deletion,
        deletionConfirmation,
        setDeletionConfirmation,
        deletionPreview,
        deleteDictionaries,
        clearSelection,
        toggleSelected,
        toggleAllLoaded,
        openSelectedDeletion,
        openAllDeletion,
        closeDeletion,
        reloadDeletionConflict,
    };
}
