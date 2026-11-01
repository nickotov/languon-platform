import type { LearningBlock } from '@languon/contracts';

/** Shared form primitives preserve blank-row filtering and identity precedence. */
export type BlockFormReadContext = {
    data: FormData;
    value(name: string): string;
    optional(name: string): string | undefined;
    rows(name: string, names: string[]): Record<string, string>[];
    common: { id: string; title?: string | undefined };
    previous: LearningBlock | undefined;
    preparedDrafts:
        | Extract<LearningBlock, { type: 'bilingual-text' }>['translations']
        | undefined;
};
