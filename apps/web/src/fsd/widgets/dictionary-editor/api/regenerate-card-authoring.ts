import { dictionaryApi } from '@/fsd/entities/dictionary';
import type {
    DictionaryCardAuthoringAction,
    DictionaryCardAuthoringGeneration,
} from '@/fsd/features/dictionary-card-authoring';
import type { RegenerateDictionaryCardAuthoringGenerationRequest } from '@languon/contracts';

type V3Request = Extract<
    RegenerateDictionaryCardAuthoringGenerationRequest,
    { format: 'card-authoring:v3' }
>;

export function regenerateCardAuthoring(
    token: string,
    generation: DictionaryCardAuthoringGeneration,
    base: Omit<V3Request, 'scope' | 'discardedSuggestionIds'>,
    action: Extract<DictionaryCardAuthoringAction, { kind: 'generate' }>,
    key: string,
) {
    const request = {
        ...base,
        discardedSuggestionIds: action.discardedSuggestionIds,
        scope: action.scope,
    };
    if (generation.format === 'card-authoring:v3') {
        return dictionaryApi.regenerateCardAuthoringGeneration(
            token,
            generation.jobId,
            request,
            key,
        );
    }
    const legacy = {
        ...request,
        draft: { overrides: base.draft.overrides, values: base.draft.values },
    };
    if (generation.format === 'card-authoring:v2') {
        return dictionaryApi.regenerateCardAuthoringGeneration(
            token,
            generation.jobId,
            { ...legacy, format: generation.format },
            key,
        );
    }
    const scope = (() => {
        if (action.scope.kind === 'all') return action.scope;
        if (action.scope.field === 'source') {
            throw new Error('Source generation requires card-authoring:v2');
        }
        return { kind: 'field' as const, field: action.scope.field };
    })();
    return dictionaryApi.regenerateCardAuthoringGeneration(
        token,
        generation.jobId,
        { ...legacy, format: generation.format, scope },
        key,
    );
}
