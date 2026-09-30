import type {
    DictionaryCardOverrides,
    DictionaryCardValues,
} from '@languon/contracts';
import type {
    DictionaryCardAuthoringField,
    DictionaryCardAuthoringProposal,
    DictionaryCardDraft,
    DictionaryCardFormProps,
} from '../types';

export const EMPTY_CARD_VALUES: DictionaryCardValues = {
    definition: null,
    example: null,
    exampleTranslation: null,
    source: '',
    transcription: null,
    translation: '',
};

export const EMPTY_CARD_OVERRIDES: DictionaryCardOverrides = {
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
    transcriptionCustomLabel: null,
    transcriptionEnabled: null,
    transcriptionNotation: null,
};

export type DraftVersion = {
    draft: DictionaryCardDraft;
    hiddenSuggestionIds: Set<string>;
    proposal: DictionaryCardAuthoringProposal | null;
    reviewedSuggestionIds: Set<string>;
    selectedSuggestions: Partial<Record<DictionaryCardAuthoringField, string>>;
};

export type DraftVersionState = {
    activeIndex: number;
    awaitingSuccessor: boolean;
    items: DraftVersion[];
};

export function createDraftVersion(
    card: DictionaryCardFormProps['card'],
    proposal: DictionaryCardAuthoringProposal | null,
): DraftVersion {
    return {
        draft: {
            overrides: card
                ? { ...card.overrides }
                : { ...EMPTY_CARD_OVERRIDES },
            translationContext: card?.translationContext ?? null,
            values: card ? { ...card.values } : { ...EMPTY_CARD_VALUES },
        },
        hiddenSuggestionIds: new Set(),
        proposal,
        reviewedSuggestionIds: new Set(),
        selectedSuggestions: {},
    };
}

export function createDraftVersionState(
    card: DictionaryCardFormProps['card'],
    proposal: DictionaryCardAuthoringProposal | null,
): DraftVersionState {
    const proposalVersion = createDraftVersion(card, proposal);
    if (!card || !proposal)
        return {
            activeIndex: 0,
            awaitingSuccessor: false,
            items: [proposalVersion],
        };

    return {
        activeIndex: 1,
        awaitingSuccessor: false,
        items: [createDraftVersion(card, null), proposalVersion],
    };
}

export function cardDraftChanged(
    draft: DictionaryCardDraft,
    card: DictionaryCardFormProps['card'],
) {
    const initialOverrides = card?.overrides ?? EMPTY_CARD_OVERRIDES;
    const contextChanged =
        draft.translationContext !== (card?.translationContext ?? null);
    const valuesChanged = card
        ? (
              Object.keys(EMPTY_CARD_VALUES) as Array<
                  keyof DictionaryCardValues
              >
          ).some((field) => draft.values[field] !== card.values[field])
        : Object.values(draft.values).some((value) => Boolean(value?.trim()));
    return (
        valuesChanged ||
        contextChanged ||
        (
            Object.keys(EMPTY_CARD_OVERRIDES) as Array<
                keyof DictionaryCardOverrides
            >
        ).some((field) => draft.overrides[field] !== initialOverrides[field])
    );
}

export function cardAuthoringProposalKey(
    proposal: DictionaryCardAuthoringProposal | null,
) {
    if (!proposal) return null;
    return JSON.stringify({
        source: proposal.source,
        sourceResult: proposal.sourceResult ?? null,
        sourceSuggestionIds: (proposal.sourceSuggestions ?? []).map(
            (suggestion) => suggestion.id,
        ),
        suggestionIds: proposal.suggestions.map((suggestion) => suggestion.id),
    });
}

export function cardAuthoringSuggestionIds(
    proposal: DictionaryCardAuthoringProposal,
) {
    return new Set([
        ...(proposal.sourceSuggestions ?? []).map(
            (suggestion) => suggestion.id,
        ),
        ...proposal.suggestions.map((suggestion) => suggestion.id),
    ]);
}
