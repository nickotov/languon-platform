export { createSentenceApi } from './api/sentence-api';
export { useSentenceSetup } from './hooks/use-sentence-setup';
export { useSentenceSession } from './hooks/use-sentence-session';
export { useSentenceHistory } from './hooks/use-sentence-history';
export { SentenceSetup } from './ui/sentence-setup/sentence-setup';
export { SentencePracticeSession } from './ui/sentence-practice-session/sentence-practice-session';
export { SentenceHistory } from './ui/sentence-history/sentence-history';
export type { Configuration, SentenceApi, TrainingTarget } from './types';
export { isAccessLoss as isSentenceAccessLoss } from './lib/api-error';

export { useSentencePreparation } from './hooks/use-sentence-preparation';
export { SentencePreparationChip } from './ui/sentence-preparation-chip/sentence-preparation-chip';
export { SentencePreparationSheet } from './ui/sentence-preparation-sheet/sentence-preparation-sheet';
export type { SentencePreparationController } from './types';

export { ApiError as SentenceApiError } from './lib/api-error';
