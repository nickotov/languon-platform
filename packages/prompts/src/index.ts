import { knowledgeExerciseEvaluationPrompt } from './local/knowledge-exercise-evaluation';
import { knowledgeBlockFieldPrompt } from './local/knowledge-block-field';
import { learnerInterviewerPrompt } from './local/learner-interviewer';
import { textTranslationPrompt, textDetectionPrompt } from './local/texts';
import { sentenceGenerationPrompt } from './local/sentence-generation';
import { sentenceCheckPrompt } from './local/sentence-check';
export { LangfuseClient } from '@langfuse/client';

import { courseBuilderPrompt } from './local/course-builder';
import { developmentHarnessPrompt } from './local/development-harness';
import { dictionaryCardGenerationPrompt } from './local/dictionary-card-generation';
import { dictionaryPastedTermsGenerationPrompt } from './local/dictionary-pasted-terms-generation';
import { dictionaryImportPairsGenerationPrompt } from './local/dictionary-import-pairs-generation';
import { dictionaryCardAuthoringPrompt } from './local/dictionary-card-authoring';
import { contextualLanguageTutorPrompt } from './local/contextual-language-tutor';

const localPrompts = {
    [knowledgeExerciseEvaluationPrompt.name]:
        knowledgeExerciseEvaluationPrompt.system,
    [knowledgeBlockFieldPrompt.name]: knowledgeBlockFieldPrompt.system,
    [learnerInterviewerPrompt.name]: learnerInterviewerPrompt.system,
    [contextualLanguageTutorPrompt.name]: contextualLanguageTutorPrompt.system,
    [textTranslationPrompt.name]: textTranslationPrompt.system,
    [textDetectionPrompt.name]: textDetectionPrompt.system,
    [sentenceGenerationPrompt.name]: sentenceGenerationPrompt.system,
    [sentenceCheckPrompt.name]: sentenceCheckPrompt.system,
    [courseBuilderPrompt.name]: courseBuilderPrompt.system,
    [developmentHarnessPrompt.name]: developmentHarnessPrompt.system,
    [dictionaryCardGenerationPrompt.name]:
        dictionaryCardGenerationPrompt.system,
    [dictionaryPastedTermsGenerationPrompt.name]:
        dictionaryPastedTermsGenerationPrompt.system,
    [dictionaryImportPairsGenerationPrompt.name]:
        dictionaryImportPairsGenerationPrompt.system,
    [dictionaryCardAuthoringPrompt.name]: dictionaryCardAuthoringPrompt.system,
} as const;

export type LocalPromptName = keyof typeof localPrompts;

export function getLocalPrompt(name: LocalPromptName): string {
    return localPrompts[name];
}
