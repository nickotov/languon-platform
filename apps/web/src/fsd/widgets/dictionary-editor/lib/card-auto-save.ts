import {
    DictionaryApiError,
    dictionaryApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import type {
    DictionaryCardAuthoringGeneration,
    DictionaryCardAuthoringSelectedSuggestion,
    DictionaryCardDraft,
} from '@/fsd/features/dictionary-card-authoring';
import type {
    DictionaryCard,
    DictionaryCardResponse,
} from '@languon/contracts';
import { cardAuthoringAcceptance } from './card-authoring-acceptance';

/** A frozen candidate must remain unchanged until its write is reconciled. */
export class CardAutoSaveError extends Error {
    public readonly reloadRequired: boolean;
    constructor(
        public override readonly cause: unknown,
        public readonly freezeDraft: boolean,
        public readonly saved = false,
    ) {
        super('The generated card could not be saved.', { cause });
        this.name = 'CardAutoSaveError';
        this.reloadRequired =
            cause instanceof DictionaryApiError &&
            cause.detail.code === 'version_conflict';
    }
}

export type CardAutoSaveInput = {
    card: DictionaryCard;
    dictionaryVersion: number;
    settingsVersion: number;
    draft: DictionaryCardDraft;
    selectedSuggestions: DictionaryCardAuthoringSelectedSuggestion[];
    generation: DictionaryCardAuthoringGeneration;
};
type CardAutoSaveResponse = DictionaryCardResponse & { unchanged?: boolean };

type Attempt = {
    fingerprint: string;
    input: CardAutoSaveInput;
    uncertain: boolean;
    accepted: boolean;
    acceptedVersion?: number;
    unchanged?: boolean;
    pending?: Promise<CardAutoSaveResponse>;
};

function sameDraft(card: DictionaryCard, draft: DictionaryCardDraft) {
    return (
        JSON.stringify(card.overrides) === JSON.stringify(draft.overrides) &&
        (card.translationContext ?? '').trim() ===
            (draft.translationContext ?? '').trim() &&
        Object.entries(draft.values).every(([field, value]) => {
            const persisted = card.values[field as keyof typeof card.values];
            return (persisted ?? '').trim() === (value ?? '').trim();
        })
    );
}

function conflict() {
    return new DictionaryApiError(409, {
        code: 'version_conflict',
        correlationId: 'client-auto-save-reconciliation',
        message: 'The card changed while saving. Reload before trying again.',
    });
}

/** One instance per editor session: coalesces polling and preserves exact retry payloads. */
export function createCardAutoSaver(
    dictionaryId: string,
    requestWithSession: RequestWithSession,
) {
    const attempts = new Map<string, Attempt>();
    return (input: CardAutoSaveInput): Promise<CardAutoSaveResponse> => {
        const fingerprint = JSON.stringify({
            cardId: input.card.id,
            draft: input.draft,
            selectedSuggestions: input.selectedSuggestions,
            generation: input.generation,
        });
        let attempt = attempts.get(input.generation.jobId);
        if (attempt && attempt.fingerprint !== fingerprint) {
            return Promise.reject(new CardAutoSaveError(conflict(), true));
        }
        if (!attempt) {
            attempt = {
                fingerprint,
                input: structuredClone(input),
                uncertain: false,
                accepted: false,
            };
            attempts.set(input.generation.jobId, attempt);
        }
        if (attempt.pending) return attempt.pending;
        const retained = attempt;
        retained.pending = save(retained).finally(() => {
            delete retained.pending;
        });
        return retained.pending;
    };

    async function save(attempt: Attempt): Promise<CardAutoSaveResponse> {
        const input = attempt.input;
        const read = () =>
            requestWithSession((token) =>
                dictionaryApi.readCard(token, dictionaryId, input.card.id),
            );
        try {
            if (!attempt.accepted && input.selectedSuggestions.length) {
                if (attempt.uncertain) {
                    const response = await requestWithSession((token) =>
                        dictionaryApi.readGenerationJob(
                            token,
                            input.generation.jobId,
                        ),
                    );
                    attempt.accepted = response.job.state === 'accepted';
                    if (
                        response.job.state === 'accepted' &&
                        response.job.outcome &&
                        'cardVersion' in response.job.outcome
                    ) {
                        attempt.acceptedVersion =
                            response.job.outcome.cardVersion;
                    }
                }
                if (!attempt.accepted) {
                    const response = await requestWithSession((token) =>
                        dictionaryApi.acceptGenerationJob(
                            token,
                            input.generation.jobId,
                            cardAuthoringAcceptance(
                                input.draft,
                                input.selectedSuggestions,
                                input.generation,
                            ),
                        ),
                    );
                    attempt.accepted = true;
                    if ('cardVersion' in response.outcome)
                        attempt.acceptedVersion = response.outcome.cardVersion;
                }
            } else if (!attempt.accepted) {
                if (attempt.uncertain) {
                    const response = await read();
                    if (response.card.version !== input.card.version) {
                        if (
                            response.card.version !== input.card.version + 1 ||
                            !sameDraft(response.card, input.draft)
                        )
                            throw conflict();
                        attempt.accepted = true;
                        attempt.acceptedVersion = response.card.version;
                        return response;
                    }
                }
                if (sameDraft(input.card, input.draft)) {
                    attempt.accepted = true;
                    attempt.acceptedVersion = input.card.version;
                    attempt.unchanged = true;
                } else {
                    const response = await requestWithSession((token) =>
                        dictionaryApi.updateCard(
                            token,
                            dictionaryId,
                            input.card.id,
                            {
                                expectedCardVersion: input.card.version,
                                expectedDictionaryVersion:
                                    input.dictionaryVersion,
                                expectedSettingsVersion: input.settingsVersion,
                                ...input.draft,
                            },
                        ),
                    );
                    attempt.accepted = true;
                    attempt.acceptedVersion = response.card.version;
                }
            }
            const response = await read();
            if (
                response.card.version !== attempt.acceptedVersion ||
                !sameDraft(response.card, input.draft)
            ) {
                throw conflict();
            }
            return attempt.unchanged
                ? { ...response, unchanged: true }
                : response;
        } catch (error) {
            const ambiguous =
                !(error instanceof DictionaryApiError) ||
                error.status === 0 ||
                error.status >= 500;
            attempt.uncertain = attempt.accepted || ambiguous;
            if (!attempt.uncertain) attempts.delete(input.generation.jobId);
            throw new CardAutoSaveError(
                error,
                attempt.uncertain,
                attempt.accepted,
            );
        }
    }
}
