export { LangfuseClient } from '@langfuse/client';

import { courseBuilderPrompt } from './local/course-builder';
import { developmentHarnessPrompt } from './local/development-harness';
import { dictionaryCardGenerationPrompt } from './local/dictionary-card-generation';
import { dictionaryPastedTermsGenerationPrompt } from './local/dictionary-pasted-terms-generation';
import { dictionaryImportPairsGenerationPrompt } from './local/dictionary-import-pairs-generation';

const localPrompts = {
    [courseBuilderPrompt.name]: courseBuilderPrompt.system,
    [developmentHarnessPrompt.name]: developmentHarnessPrompt.system,
    [dictionaryCardGenerationPrompt.name]:
        dictionaryCardGenerationPrompt.system,
    [dictionaryPastedTermsGenerationPrompt.name]:
        dictionaryPastedTermsGenerationPrompt.system,
    [dictionaryImportPairsGenerationPrompt.name]:
        dictionaryImportPairsGenerationPrompt.system,
} as const;

export type LocalPromptName = keyof typeof localPrompts;

export function getLocalPrompt(name: LocalPromptName): string {
    return localPrompts[name];
}
