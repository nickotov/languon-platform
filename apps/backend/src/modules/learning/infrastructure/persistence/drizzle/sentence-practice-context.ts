import type {
    SentenceDirection,
    SentenceNextRequest,
    SentencePreparationBatch,
} from '@languon/contracts';
import { sql, type SQL } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TextAiAdmissionExecution } from '../../../../text-ai/application/text-ai-admission-participant';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    sentenceLanguageScript,
    sentenceLetterSqlRange,
} from '../../../domain/sentence-language';
import {
    type SentenceDatabase,
    type SentenceTransaction,
} from './sentence-persistence-support';

export interface SentencePersistencePolicy {
    generationFormat?: 'sentence-generation:v1' | 'sentence-generation:v2';
    resolveExecution: (
        tx: SentenceTransaction,
        userId: string,
        format: string,
        now: Date,
        requiredWorkerFormat?: string,
    ) => Promise<TextAiAdmissionExecution>;
    resolvePreparedBatch?: (
        tx: SentenceTransaction,
        access: LearningAccess,
        id: string,
        context: SentenceContext,
    ) => Promise<SentencePreparationBatch & { direction: SentenceDirection }>;
    defaultMaxAttempts?: number;
    globalQueueLimit?: number;
    userQueueLimit?: number;
    globalConcurrency?: number;
    userConcurrency?: number;
}

export function fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalized(input: SentenceNextRequest) {
    return {
        ...input,
        scope:
            input.scope.type === 'all'
                ? input.scope
                : {
                      type: 'manual',
                      entryIds: [...input.scope.entryIds].sort(),
                  },
        visitedExerciseIds: [...input.visitedExerciseIds].sort(),
    };
}

export function languageCondition(
    text: SQL,
    language: string,
    otherLanguage: string,
): SQL {
    const expected = sentenceLanguageScript(language);
    const other = sentenceLanguageScript(otherLanguage);
    if (
        !expected ||
        !other ||
        expected.name === other.name ||
        (['Hani', 'Jpan', 'Kore'].includes(expected.name) &&
            ['Hani', 'Jpan', 'Kore'].includes(other.name))
    )
        return sql`true`;
    const expectedCount = sql`char_length(regexp_replace(${text} collate "C", ${`[^${expected.sqlRange}]`}, '', 'g'))`;
    const otherCount = sql`char_length(regexp_replace(${text} collate "C", ${`[^${other.sqlRange}]`}, '', 'g'))`;
    const letterCount = sql`char_length(regexp_replace(${text} collate "C", ${`[^${sentenceLetterSqlRange()}]`}, '', 'g'))`;

    // Numeric/symbol-only text has no script to identify, matching domain validation.
    return sql`(${letterCount} = 0 or (${expectedCount} > 0 and ${expectedCount} >= ${otherCount}))`;
}

export const historyCursorSchema = z
    .object({
        kind: z.enum(['attempts', 'manual-reviews']),
        date: z.iso.datetime(),
        id: z.uuid(),
        learnerId: z.uuid(),
        dictionaryId: z.uuid(),
        direction: z.enum(['source-to-target', 'target-to-source']).nullable(),
        exerciseId: z.uuid().nullable(),
    })
    .strict();

export interface SentencePracticePersistenceContext {
    database: SentenceDatabase;
    policy: SentencePersistencePolicy;
}
