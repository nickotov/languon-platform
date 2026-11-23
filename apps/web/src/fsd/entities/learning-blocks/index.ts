export { LearningBlockView } from './ui/learning-block-view/learning-block-view';
export { ExerciseEvaluation } from './ui/exercise-block/ui/exercise-evaluation/exercise-evaluation';
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
export {
    namedExerciseLabels,
    exerciseCheckingLabel,
} from './lib/named-exercise-labels';

export {
    exerciseActivityExamples,
    exerciseExampleSources,
} from './lib/activity-examples/activity-examples';
export type { ExerciseActivityExample } from './lib/activity-examples/activity-examples';
export { exerciseExampleLabels } from './lib/activity-examples/example-labels';
export { ExerciseActivityPreview } from './ui/exercise-activity-preview/exercise-activity-preview';
export { ExerciseActivityBrowser } from './ui/exercise-activity-browser/exercise-activity-browser';

export { exerciseSource } from './lib/exercise-source';
