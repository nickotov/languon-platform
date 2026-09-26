import {
    dictionaryApi,
    toggleDeletionTarget,
    toggleLoadedDeletionTargets,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import type { DictionaryCard } from '@languon/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

type Deletion =
    | {
          kind: 'selected';
          cards: readonly DictionaryCard[];
          expectedDictionaryVersion: number;
      }
    | {
          kind: 'all';
          count: number;
          snapshot: string;
          expectedDictionaryVersion: number;
      };

export function useDictionaryCardDeletion({
    cards,
    dictionaryId,
    dictionaryVersion,
    requestWithSession,
    resetKey,
    setOutcome,
}: {
    cards: readonly DictionaryCard[];
    dictionaryId: string;
    dictionaryVersion: number;
    requestWithSession: RequestWithSession;
    resetKey: string;
    setOutcome(message: string): void;
}) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [selectionLimitReached, setSelectionLimitReached] = useState(false);
    const [deletion, setDeletion] = useState<Deletion | null>(null);
    const [acknowledged, setAcknowledged] = useState(false);
    const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

    useEffect(() => {
        setSelected(new Set());
        setSelectionLimitReached(false);
        setDeletion(null);
        setAcknowledged(false);
    }, [resetKey]);

    const preview = useMutation({
        mutationFn: () =>
            requestWithSession((token) =>
                dictionaryApi.previewDictionaryCardDeletion(
                    token,
                    dictionaryId,
                ),
            ),
        onSuccess: (result) => {
            if (result.eligibleCount > 0) {
                setDeletion({
                    kind: 'all',
                    count: result.eligibleCount,
                    snapshot: result.snapshot,
                    expectedDictionaryVersion: dictionaryVersion,
                });
                setAcknowledged(false);
            } else {
                setOutcome(t('dictionary.deletion.noneAvailable'));
            }
        },
    });

    const remove = useMutation({
        mutationFn: () => {
            if (!deletion) throw new Error('Deletion unavailable');
            const body = {
                expectedDictionaryVersion: deletion.expectedDictionaryVersion,
                scope:
                    deletion.kind === 'all'
                        ? {
                              kind: 'all-archived' as const,
                              snapshot: deletion.snapshot,
                          }
                        : {
                              kind: 'selected' as const,
                              targets: deletion.cards.map((card) => ({
                                  cardId: card.id,
                                  expectedVersion: card.version,
                              })),
                          },
            };
            const fingerprint = JSON.stringify(body);
            if (attempt.current?.fingerprint !== fingerprint) {
                attempt.current = { fingerprint, key: crypto.randomUUID() };
            }
            return requestWithSession((token) =>
                dictionaryApi.deleteDictionaryCards(
                    token,
                    dictionaryId,
                    body,
                    attempt.current!.key,
                ),
            );
        },
        onSuccess: async (receipt) => {
            attempt.current = null;
            setDeletion(null);
            setAcknowledged(false);
            setSelected(new Set());
            setSelectionLimitReached(false);
            setOutcome(
                t('dictionary.deletion.cardsDeleted', {
                    count: receipt.deletedCount,
                }),
            );
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['dictionary-cards', dictionaryId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['dictionary', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
            document.getElementById('archived-cards-filter')?.focus();
        },
    });

    function toggle(cardId: string) {
        const update = toggleDeletionTarget(selected, cardId);
        setSelected(update.selected);
        setSelectionLimitReached(update.limitReached);
    }

    function toggleAllLoaded() {
        const update = toggleLoadedDeletionTargets(
            selected,
            cards.map((card) => card.id),
        );
        setSelected(update.selected);
        setSelectionLimitReached(update.limitReached);
    }

    function openSelected(card?: DictionaryCard) {
        const targets = card
            ? [card]
            : cards.filter((entry) => selected.has(entry.id));
        if (!targets.length) return;
        remove.reset();
        setAcknowledged(false);
        setDeletion({
            kind: 'selected',
            cards: targets,
            expectedDictionaryVersion: dictionaryVersion,
        });
    }

    function openAll() {
        remove.reset();
        preview.mutate();
    }

    function close() {
        if (remove.isPending) return;
        setDeletion(null);
        setAcknowledged(false);
        remove.reset();
    }

    async function reloadConflict() {
        close();
        setSelected(new Set());
        setSelectionLimitReached(false);
        await Promise.all([
            queryClient.refetchQueries({
                queryKey: ['dictionary-cards', dictionaryId],
            }),
            queryClient.refetchQueries({
                queryKey: ['dictionary', dictionaryId],
            }),
        ]);
    }

    return {
        selected,
        selectionLimitReached,
        deletion,
        acknowledged,
        setAcknowledged,
        preview,
        remove,
        toggle,
        toggleAllLoaded,
        openSelected,
        openAll,
        close,
        reloadConflict,
    };
}

export type DictionaryCardDeletionController = ReturnType<
    typeof useDictionaryCardDeletion
>;
