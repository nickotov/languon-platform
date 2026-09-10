export {
    DictionaryCardForm,
    type DictionaryCardAuthoringAction,
    type DictionaryCardAuthoringAI,
    type DictionaryCardDraft,
} from './ui/dictionary-card-form/dictionary-card-form';
export { previewCardEffectiveSettings } from './lib/preview-card-effective-settings';
export {
    hasLoadedSourceDuplicate,
    normalizeDictionarySource,
} from './lib/duplicate-source';
export {
    retainCardAuthoringIdempotencyAttempt,
    type CardAuthoringIdempotencyAttempt,
} from './lib/idempotency-attempt';
export {
    discardedSuggestionIdsForPredecessor,
    planCardAuthoringCleanup,
    resolveCardAuthoringCleanupRead,
    type CardAuthoringCleanupPlan,
} from './lib/authoring-job-cleanup';
