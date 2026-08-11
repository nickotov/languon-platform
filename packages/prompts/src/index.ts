export { LangfuseClient } from "@langfuse/client";

import { courseBuilderPrompt } from "./local/course-builder";

const localPrompts = {
  [courseBuilderPrompt.name]: courseBuilderPrompt.system,
} as const;

export type LocalPromptName = keyof typeof localPrompts;

export function getLocalPrompt(name: LocalPromptName): string {
  return localPrompts[name];
}
