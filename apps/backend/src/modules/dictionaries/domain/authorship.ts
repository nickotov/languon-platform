export type CardAuthorship = 'ai-generated' | 'human' | 'mixed';

export type CardMutationKind =
    | 'ai_proposal_accept'
    | 'archive'
    | 'fork'
    | 'inherited_settings_change'
    | 'manual_edit'
    | 'reorder'
    | 'restore';

export interface CardMutationAuthorshipResult {
    authorship: CardAuthorship;
    createsRevision: boolean;
    noOp: boolean;
}

export interface CardSemanticState {
    overrides: CardSettingsOverrides;
    values: DictionaryCardValues;
}

export function areCardSemanticStatesEqual(
    first: CardSemanticState,
    second: CardSemanticState,
): boolean {
    const firstValues = normalizeCardValues(first.values);
    const secondValues = normalizeCardValues(second.values);
    const firstOverrides = normalizeCardSettingsOverrides(first.overrides);
    const secondOverrides = normalizeCardSettingsOverrides(second.overrides);

    return (
        firstValues.source === secondValues.source &&
        firstValues.translation === secondValues.translation &&
        firstValues.transcription === secondValues.transcription &&
        firstValues.definition === secondValues.definition &&
        firstValues.example === secondValues.example &&
        firstValues.exampleTranslation === secondValues.exampleTranslation &&
        firstOverrides.transcriptionEnabled ===
            secondOverrides.transcriptionEnabled &&
        firstOverrides.definitionEnabled ===
            secondOverrides.definitionEnabled &&
        firstOverrides.exampleEnabled === secondOverrides.exampleEnabled &&
        firstOverrides.exampleTranslationEnabled ===
            secondOverrides.exampleTranslationEnabled &&
        firstOverrides.definitionLanguageRole ===
            secondOverrides.definitionLanguageRole &&
        firstOverrides.exampleLanguageRole ===
            secondOverrides.exampleLanguageRole &&
        firstOverrides.transcriptionNotation ===
            secondOverrides.transcriptionNotation &&
        firstOverrides.customNotationLabel ===
            secondOverrides.customNotationLabel
    );
}

export function authorshipForNewCard(
    source: 'ai_candidate' | 'deterministic_import' | 'manual',
    candidateEdited = false,
): CardAuthorship {
    if (source !== 'ai_candidate') {
        return 'human';
    }

    return candidateEdited ? 'mixed' : 'ai-generated';
}

export function resolveCardMutationAuthorship(input: {
    mutationKind: CardMutationKind;
    prior: CardAuthorship;
    proposalEdited?: boolean;
    semanticChange: boolean;
}): CardMutationAuthorshipResult {
    if (!input.semanticChange) {
        return {
            authorship: input.prior,
            createsRevision: false,
            noOp: true,
        };
    }

    if (input.mutationKind === 'manual_edit') {
        return {
            authorship: input.prior === 'human' ? 'human' : 'mixed',
            createsRevision: true,
            noOp: false,
        };
    }

    if (input.mutationKind === 'ai_proposal_accept') {
        return {
            authorship:
                input.proposalEdited || input.prior !== 'ai-generated'
                    ? 'mixed'
                    : 'ai-generated',
            createsRevision: true,
            noOp: false,
        };
    }

    return {
        authorship: input.prior,
        createsRevision: false,
        noOp: false,
    };
}
import { type DictionaryCardValues, normalizeCardValues } from './limits';
import {
    type CardSettingsOverrides,
    normalizeCardSettingsOverrides,
} from './settings';
