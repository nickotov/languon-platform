export { LearningBlockView } from './ui/learning-block-view/learning-block-view';
export type {
    LearningBlockLabels,
    LearningBlockViewProps,
    LearningInteraction,
    LearningAnswer,
    VideoReplaySource,
    LearningBlockVariant,
    LearningBlockPlayback,
    LearningPlaybackRequest,
    LearningPrivateStudy,
} from './types';
export { buildExerciseFeedbackRequest } from './lib/exercise-feedback-request';

export { BilingualBlock as BilingualTextView } from './ui/bilingual-block/bilingual-block';

export { LearningExerciseSet } from './ui/learning-exercise-set/learning-exercise-set';
export type { LearningExerciseEntry } from './ui/learning-exercise-set/learning-exercise-set';

export {
    learningBlockIcons,
    learningBlockCount,
} from './lib/learning-block-metadata';
export { exercisePracticeIdentity } from './lib/exercise-practice-identity';
