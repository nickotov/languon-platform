import { useEffect, useRef, useState } from 'react';
import type {
    DictionaryCard,
    DictionaryCardOverrides,
    DictionaryCardValues,
} from '@languon/contracts';
import type { DictionaryCardFormProps } from '../types';
import { editCardDraftValue } from '../lib/edit-card-draft';
import {
    cardAuthoringProposalKey,
    cardAuthoringSuggestionIds,
    cardDraftChanged,
    createDraftVersion,
    type DraftVersion,
    type DraftVersionState,
} from '../lib/card-draft-versions';
import { applyAuthoringResult } from '../lib/apply-authoring-result';
import { previewCardEffectiveSettings } from '../lib/preview-card-effective-settings';

export function useCardDraft({
    card,
    ai,
    dictionary,
    onDirtyChange,
}: DictionaryCardFormProps) {
    const [versions, setVersions] = useState<DraftVersionState>(() => ({
        activeIndex: 0,
        awaitingSuccessor: false,
        items: [createDraftVersion(card, null)],
    }));
    const [baseline, setBaseline] = useState(card);
    const [staleResult, setStaleResult] = useState(false);
    const [appliedResult, setAppliedResult] = useState<{
        key: string;
        session: string;
        version: DraftVersion;
    } | null>(null);
    const appliedKeys = useRef(new Set<string>());
    const session = card?.id ?? 'new';
    const previousSession = useRef(session);
    const changedSession = previousSession.current !== session;
    const activeVersion = versions.items[versions.activeIndex]!;
    const incoming = ai?.proposal;
    const incomingKey = incoming
        ? (ai?.proposalJobId ??
          ai?.job?.id ??
          cardAuthoringProposalKey(incoming))
        : null;
    const dirty = cardDraftChanged(activeVersion.draft, baseline);
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
        if (previousSession.current === session) return;
        previousSession.current = session;
        appliedKeys.current.clear();
        setBaseline(card);
        setAppliedResult(null);
        setVersions({
            activeIndex: 0,
            awaitingSuccessor: false,
            items: [createDraftVersion(card, null)],
        });
    }, [session, card]);
    useEffect(() => {
        if (
            changedSession ||
            !incoming ||
            !incomingKey ||
            (ai?.job && ai.job.state !== 'review') ||
            appliedKeys.current.has(incomingKey)
        )
            return;
        appliedKeys.current.add(incomingKey);
        const latest = versions.items.at(-1)!;
        const source = latest.draft.values.source.trim();
        const context =
            latest.draft.translationContext?.trim() ||
            dictionary.translationContext?.trim() ||
            null;
        const sourceMatches =
            !source ||
            incoming.source === source ||
            incoming.sourceSuggestions?.some(
                (suggestion) =>
                    latest.selectedSuggestions.source === suggestion.id &&
                    suggestion.value === source,
            );
        const contextMatches =
            ai?.format === 'card-authoring:v3'
                ? (incoming.translationContext ?? null) === context
                : context === null;
        if (!sourceMatches || !contextMatches) {
            setStaleResult(true);
            setVersions((current) => ({
                ...current,
                awaitingSuccessor: false,
            }));
            return;
        }
        setStaleResult(false);
        const generation =
            ai?.job && ai.format
                ? { jobId: ai.proposalJobId ?? ai.job.id, format: ai.format }
                : undefined;
        const next = applyAuthoringResult(
            latest,
            incoming,
            previewCardEffectiveSettings(
                dictionary.settings.values,
                latest.draft.overrides,
            ),
            generation,
        );
        const preserve =
            Boolean(card) ||
            Boolean(latest.generation) ||
            versions.awaitingSuccessor ||
            Object.entries(latest.draft.values).some(
                ([field, value]) =>
                    field !== 'source' && Boolean(value?.trim()),
            );
        setVersions({
            activeIndex: preserve
                ? versions.items.length
                : versions.items.length - 1,
            awaitingSuccessor: false,
            items: preserve
                ? [...versions.items, next]
                : [...versions.items.slice(0, -1), next],
        });
        setAppliedResult({ key: incomingKey, session, version: next });
    }, [
        incoming,
        incomingKey,
        ai?.job,
        ai?.format,
        ai?.proposalJobId,
        card,
        dictionary.settings.values,
        dictionary.translationContext,
        versions,
        changedSession,
        session,
    ]);
    useEffect(() => {
        if (
            !['failed', 'cancelled', 'expired', 'discarded'].includes(
                ai?.job?.state ?? '',
            )
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
    ) {
        updateActive((current) => editCardDraftValue(current, key, value));
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
            selectedSuggestions: {},
        }));
    }
    function markSaved(saved: DictionaryCard) {
        setBaseline(saved);
        setVersions((current) => ({
            ...current,
            items: current.items.map((item, index) =>
                index === current.items.length - 1
                    ? createDraftVersion(saved, null)
                    : item,
            ),
        }));
    }
    function setActiveVersion(index: number) {
        setVersions((current) => ({
            ...current,
            activeIndex: Math.max(0, Math.min(index, current.items.length - 1)),
        }));
    }
    const discardedSuggestionIds = activeVersion.proposal
        ? [...cardAuthoringSuggestionIds(activeVersion.proposal)].filter(
              (id) =>
                  !Object.values(activeVersion.selectedSuggestions).includes(
                      id,
                  ),
          )
        : [];
    return {
        activeVersion,
        activeVersionIndex: versions.activeIndex,
        appliedResult,
        beginSuccessor: () =>
            setVersions((current) => ({ ...current, awaitingSuccessor: true })),
        cancelSuccessor: () =>
            setVersions((current) => ({
                ...current,
                awaitingSuccessor: false,
            })),
        draft: activeVersion.draft,
        dirty,
        discardedSuggestionIds,
        isLatestVersion: versions.activeIndex === versions.items.length - 1,
        proposal: activeVersion.proposal,
        staleResult,
        markSaved,
        replaceOverrides,
        setActiveVersion,
        setOverride,
        setTranslationContext,
        setValue,
        versionCount: versions.items.length,
    };
}
