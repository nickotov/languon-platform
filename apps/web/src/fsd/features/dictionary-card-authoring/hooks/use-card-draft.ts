import { useEffect, useState } from 'react';
import type {
    DictionaryCardValues,
    DictionaryCardOverrides,
} from '@languon/contracts';
import type {
    DictionaryCardAuthoringField,
    DictionaryCardDraft,
    DictionaryCardFormProps,
} from '../types';

const EMPTY_VALUES: DictionaryCardValues = {
    definition: null,
    example: null,
    exampleTranslation: null,
    source: '',
    transcription: null,
    translation: '',
};

const EMPTY_OVERRIDES: DictionaryCardOverrides = {
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
    transcriptionCustomLabel: null,
    transcriptionEnabled: null,
    transcriptionNotation: null,
};

export function useCardDraft({
    card,
    ai,
    onDirtyChange,
}: DictionaryCardFormProps) {
    const [draft, setDraft] = useState<DictionaryCardDraft>(() => ({
        overrides: card ? { ...card.overrides } : { ...EMPTY_OVERRIDES },
        values: card ? { ...card.values } : { ...EMPTY_VALUES },
    }));

    const initialOverrides = card?.overrides ?? EMPTY_OVERRIDES;
    const valuesChanged = card
        ? (Object.keys(EMPTY_VALUES) as Array<keyof DictionaryCardValues>).some(
              (field) => draft.values[field] !== card.values[field],
          )
        : Object.values(draft.values).some((value) => Boolean(value?.trim()));

    const dirty =
        valuesChanged ||
        (
            Object.keys(EMPTY_OVERRIDES) as Array<keyof DictionaryCardOverrides>
        ).some((field) => draft.overrides[field] !== initialOverrides[field]);

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    const [hiddenSuggestionIds, setHiddenSuggestionIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [selectedSuggestions, setSelectedSuggestions] = useState<
        Partial<Record<DictionaryCardAuthoringField, string>>
    >({});

    useEffect(() => {
        setDraft({
            overrides: card ? { ...card.overrides } : { ...EMPTY_OVERRIDES },
            values: card ? { ...card.values } : { ...EMPTY_VALUES },
        });
        setHiddenSuggestionIds(new Set());
        setSelectedSuggestions({});
    }, [card]);

    useEffect(() => {
        if (!ai?.proposal) return;
        const predecessorIds = new Set([
            ...(ai.proposal.sourceSuggestions ?? []).map(
                (suggestion) => suggestion.id,
            ),
            ...ai.proposal.suggestions.map((suggestion) => suggestion.id),
        ]);
        setHiddenSuggestionIds((current) => {
            const retained = [...current].filter((id) =>
                predecessorIds.has(id),
            );
            return retained.length === current.size
                ? current
                : new Set(retained);
        });
    }, [ai?.proposal]);

    function setValue<K extends keyof DictionaryCardValues>(
        key: K,
        value: DictionaryCardValues[K],
        preserveSelection = false,
    ) {
        setDraft((current) => ({
            ...current,
            values: { ...current.values, [key]: value },
        }));
        if (preserveSelection) return;
        if (key !== 'source') {
            const selectedId =
                selectedSuggestions[key as DictionaryCardAuthoringField];
            if (selectedId) {
                setHiddenSuggestionIds((hidden) =>
                    new Set(hidden).add(selectedId),
                );
            }
        }
        setSelectedSuggestions((current) => {
            if (key === 'source') return {};
            const field = key as DictionaryCardAuthoringField;
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
        if (key === 'source' && ai?.proposal) {
            setHiddenSuggestionIds(
                new Set([
                    ...(ai.proposal.sourceSuggestions ?? []).map(
                        (suggestion) => suggestion.id,
                    ),
                    ...ai.proposal.suggestions.map(
                        (suggestion) => suggestion.id,
                    ),
                ]),
            );
        }
    }

    function setOverride<K extends keyof DictionaryCardOverrides>(
        key: K,
        value: DictionaryCardOverrides[K],
    ) {
        setDraft((current) => ({
            ...current,
            overrides: { ...current.overrides, [key]: value },
        }));
    }

    function replaceOverrides(overrides: DictionaryCardOverrides) {
        setDraft((current) => ({ ...current, overrides }));
    }

    return {
        replaceOverrides,
        draft,
        setValue,
        setOverride,
        hiddenSuggestionIds,
        setHiddenSuggestionIds,
        selectedSuggestions,
        setSelectedSuggestions,
    };
}
