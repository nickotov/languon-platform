import { dictionaryChatSnippetAuthoringPrompt } from './local/dictionary-chat-snippet-authoring';
import { learningContentAuthoringPrompt } from './local/learning-content-authoring';
import { tutorRequestResolutionPrompt } from './local/tutor-request-resolution';
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

const localPromptDefinitions = [
    {
        ...dictionaryChatSnippetAuthoringPrompt,
        sourcePath:
            'packages/prompts/src/local/dictionary-chat-snippet-authoring.ts',
    },
    {
        ...learningContentAuthoringPrompt,
        sourcePath: 'packages/prompts/src/local/learning-content-authoring.ts',
    },
    {
        ...tutorRequestResolutionPrompt,
        sourcePath: 'packages/prompts/src/local/tutor-request-resolution.ts',
    },
    {
        ...knowledgeExerciseEvaluationPrompt,
        sourcePath:
            'packages/prompts/src/local/knowledge-exercise-evaluation.ts',
    },
    {
        ...knowledgeBlockFieldPrompt,
        sourcePath: 'packages/prompts/src/local/knowledge-block-field.ts',
    },
    {
        ...learnerInterviewerPrompt,
        sourcePath: 'packages/prompts/src/local/learner-interviewer.ts',
    },
    {
        ...contextualLanguageTutorPrompt,
        sourcePath: 'packages/prompts/src/local/contextual-language-tutor.ts',
    },
    {
        ...textTranslationPrompt,
        sourcePath: 'packages/prompts/src/local/texts.ts',
    },
    {
        ...textDetectionPrompt,
        sourcePath: 'packages/prompts/src/local/texts.ts',
    },
    {
        ...sentenceGenerationPrompt,
        sourcePath: 'packages/prompts/src/local/sentence-generation.ts',
    },
    {
        ...sentenceCheckPrompt,
        sourcePath: 'packages/prompts/src/local/sentence-check.ts',
    },
    {
        ...courseBuilderPrompt,
        sourcePath: 'packages/prompts/src/local/course-builder.ts',
    },
    {
        ...developmentHarnessPrompt,
        sourcePath: 'packages/prompts/src/local/development-harness.ts',
    },
    {
        ...dictionaryCardGenerationPrompt,
        sourcePath: 'packages/prompts/src/local/dictionary-card-generation.ts',
    },
    {
        ...dictionaryPastedTermsGenerationPrompt,
        sourcePath:
            'packages/prompts/src/local/dictionary-pasted-terms-generation.ts',
    },
    {
        ...dictionaryImportPairsGenerationPrompt,
        sourcePath:
            'packages/prompts/src/local/dictionary-import-pairs-generation.ts',
    },
    {
        ...dictionaryCardAuthoringPrompt,
        sourcePath: 'packages/prompts/src/local/dictionary-card-authoring.ts',
    },
] as const;

export type LocalPromptName = (typeof localPromptDefinitions)[number]['name'];

const localPrompts = Object.fromEntries(
    localPromptDefinitions.map((prompt) => [prompt.name, prompt.system]),
) as Record<LocalPromptName, string>;

export function getLocalPrompt(name: LocalPromptName): string {
    return localPrompts[name];
}

export {
    dictionarySourceNormalizationRule,
    dictionaryNounArticleRule,
} from './local/dictionary-language-policy';

/** Checked-in prompt inventory. Request-specific user content is never included. */
export function listLocalPrompts(): ReadonlyArray<{
    name: LocalPromptName;
    content: string;
    sourcePath: string;
}> {
    return localPromptDefinitions.map(({ name, system, sourcePath }) => ({
        name,
        content: system,
        sourcePath,
    }));
}
