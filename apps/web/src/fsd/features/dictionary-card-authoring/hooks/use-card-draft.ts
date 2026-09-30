import { useEffect, useMemo, useState } from 'react';
import type {
    DictionaryCardOverrides,
    DictionaryCardValues,
} from '@languon/contracts';
import type {
    DictionaryCardAuthoringField,
    DictionaryCardFormProps,
} from '../types';
import {
    cardAuthoringProposalKey,
    cardAuthoringSuggestionIds,
    cardDraftChanged,
    createDraftVersionState,
    type DraftVersion,
    type DraftVersionState,
} from '../lib/card-draft-versions';

export function useCardDraft({
    card,
    ai,
    onDirtyChange,
}: DictionaryCardFormProps) {
    const incomingProposal = ai?.proposal ?? null;
    const incomingProposalKey = cardAuthoringProposalKey(incomingProposal);
    const cardResetKey = card
        ? `${card.id}:${card.version}:${card.settingsVersion}`
        : 'new';
    const [versions, setVersions] = useState<DraftVersionState>(() =>
        createDraftVersionState(card, incomingProposal),
    );
    const activeVersion = versions.items[versions.activeIndex]!;

    const dirty = useMemo(
        () => versions.items.some(({ draft }) => cardDraftChanged(draft, card)),
        [card, versions.items],
    );

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    useEffect(() => {
        setVersions(createDraftVersionState(card, incomingProposal));
    }, [cardResetKey]);

    useEffect(() => {
        if (!incomingProposal) return;
        setVersions((current) => {
            const latest = current.items.at(-1)!;
            if (
                cardAuthoringProposalKey(latest.proposal) ===
                incomingProposalKey
            )
                return current;

            const retainedIds = cardAuthoringSuggestionIds(incomingProposal);
            const selectedSuggestions = Object.fromEntries(
                Object.entries(latest.selectedSuggestions).filter(([, id]) =>
                    Boolean(id && retainedIds.has(id)),
                ),
            );
            const nextVersion: DraftVersion = {
                ...latest,
                draft: {
                    overrides: { ...latest.draft.overrides },
                    translationContext: latest.draft.translationContext,
                    values: { ...latest.draft.values },
                },
                hiddenSuggestionIds: new Set(
                    [...latest.hiddenSuggestionIds].filter((id) =>
                        retainedIds.has(id),
                    ),
                ),
                proposal: incomingProposal,
                reviewedSuggestionIds: new Set(latest.reviewedSuggestionIds),
                selectedSuggestions,
            };

            if (current.awaitingSuccessor) {
                return {
                    activeIndex: current.items.length,
                    awaitingSuccessor: false,
                    items: [...current.items, nextVersion],
                };
            }

            return {
                ...current,
                items: [...current.items.slice(0, -1), nextVersion],
            };
        });
    }, [incomingProposal, incomingProposalKey]);

    useEffect(() => {
        const state = ai?.job?.state;
        if (
            state !== 'failed' &&
            state !== 'cancelled' &&
            state !== 'expired' &&
            state !== 'discarded'
        )
            return;
        setVersions((current) =>
            current.awaitingSuccessor
                ? { ...current, awaitingSuccessor: false }
                : current,
        );
    }, [ai?.job?.state]);

    function updateActive(update: (current: DraftVersion) => DraftVersion) {
        setVersions((current) => ({
            ...current,
            items: current.items.map((item, index) =>
                index === current.activeIndex ? update(item) : item,
            ),
        }));
    }

    function setValue<K extends keyof DictionaryCardValues>(
        key: K,
        value: DictionaryCardValues[K],
        preserveSelection = false,
    ) {
        updateActive((current) => {
            const hiddenSuggestionIds = new Set(current.hiddenSuggestionIds);
            const selectedSuggestions = { ...current.selectedSuggestions };
            if (!preserveSelection && key !== 'source') {
                const field = key as DictionaryCardAuthoringField;
                const selectedId = selectedSuggestions[field];
                if (selectedId) hiddenSuggestionIds.add(selectedId);
                delete selectedSuggestions[field];
            }
            if (!preserveSelection && key === 'source' && current.proposal) {
                for (const id of cardAuthoringSuggestionIds(current.proposal))
                    hiddenSuggestionIds.add(id);
                for (const field of Object.keys(selectedSuggestions))
                    delete selectedSuggestions[
                        field as DictionaryCardAuthoringField
                    ];
            }
            return {
                ...current,
                draft: {
                    ...current.draft,
                    values: { ...current.draft.values, [key]: value },
                },
                hiddenSuggestionIds,
                selectedSuggestions,
            };
        });
    }

    function setOverride<K extends keyof DictionaryCardOverrides>(
        key: K,
        value: DictionaryCardOverrides[K],
    ) {
        updateActive((current) => ({
            ...current,
            draft: {
                ...current.draft,
                overrides: { ...current.draft.overrides, [key]: value },
            },
        }));
    }

    function replaceOverrides(overrides: DictionaryCardOverrides) {
        updateActive((current) => ({
            ...current,
            draft: { ...current.draft, overrides },
        }));
    }

    function setTranslationContext(translationContext: string | null) {
        updateActive((current) => ({
            ...current,
            draft: { ...current.draft, translationContext },
        }));
    }

    return {
        activeVersionIndex: versions.activeIndex,
        beginSuccessor: () =>
            setVersions((current) => ({
                ...current,
                awaitingSuccessor: true,
            })),
        cancelSuccessor: () =>
            setVersions((current) => ({
                ...current,
                awaitingSuccessor: false,
            })),
        draft: activeVersion.draft,
        hiddenSuggestionIds: activeVersion.hiddenSuggestionIds,
        isLatestVersion: versions.activeIndex === versions.items.length - 1,
        proposal: activeVersion.proposal,
        replaceOverrides,
        reviewedSuggestionIds: activeVersion.reviewedSuggestionIds,
        selectedSuggestions: activeVersion.selectedSuggestions,
        setActiveVersion: (index: number) =>
            setVersions((current) => ({
                ...current,
                activeIndex: Math.max(
                    0,
                    Math.min(index, current.items.length - 1),
                ),
            })),
        setHiddenSuggestionIds: (
            update: Set<string> | ((current: Set<string>) => Set<string>),
        ) =>
            updateActive((current) => ({
                ...current,
                hiddenSuggestionIds:
                    typeof update === 'function'
                        ? update(current.hiddenSuggestionIds)
                        : update,
            })),
        setOverride,
        setTranslationContext,
        setReviewedSuggestionIds: (
            update: (current: Set<string>) => Set<string>,
        ) =>
            updateActive((current) => ({
                ...current,
                reviewedSuggestionIds: update(current.reviewedSuggestionIds),
            })),
        setSelectedSuggestions: (
            update: (
                current: Partial<Record<DictionaryCardAuthoringField, string>>,
            ) => Partial<Record<DictionaryCardAuthoringField, string>>,
        ) =>
            updateActive((current) => ({
                ...current,
                selectedSuggestions: update(current.selectedSuggestions),
            })),
        setValue,
        versionCount: versions.items.length,
    };
}
