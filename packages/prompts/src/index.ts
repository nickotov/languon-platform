export { LangfuseClient } from '@langfuse/client';

import { courseBuilderPrompt } from './local/course-builder';
import { developmentHarnessPrompt } from './local/development-harness';

const localPrompts = {
    [courseBuilderPrompt.name]: courseBuilderPrompt.system,
    [developmentHarnessPrompt.name]: developmentHarnessPrompt.system,
} as const;

export type LocalPromptName = keyof typeof localPrompts;

export function getLocalPrompt(name: LocalPromptName): string {
    return localPrompts[name];
}
