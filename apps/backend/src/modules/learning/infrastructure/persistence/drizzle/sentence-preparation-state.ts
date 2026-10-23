import { type SentencePreparationBatch } from '@languon/contracts';
import { createHash } from 'node:crypto';
import type { LegacyActionSnapshot } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    type SentenceDatabase,
    type SentenceTransaction,
} from './sentence-persistence-support';
import type {
    sentencePreparationBatchesTable as batches,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';

export type Preparation = typeof preparations.$inferSelect;

export type Batch = typeof batches.$inferSelect;

export interface SentencePreparationAdmissionRequest {
    preparationId: string;
    batchId: string;
    coordinatorFence: bigint;
}

export interface SentencePreparationPersistencePolicy {
    authorizeAction(
        tx: SentenceTransaction,
        access: LearningAccess,
        request: {
            actionId: string;
            operationId: string;
            fingerprint: string;
            inputPayload: unknown;
        },
        context: SentenceContext,
    ): Promise<{ snapshot: LegacyActionSnapshot; revisionId: string }>;
    admitGeneration(
        tx: SentenceTransaction,
        access: LearningAccess,
        request: SentencePreparationAdmissionRequest,
        context: SentenceContext,
    ): Promise<{ jobId: string }>;
}

export function hash(input: unknown) {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function accessFor(row: Preparation): LearningAccess {
    return row.authority.kind === 'owner'
        ? {
              kind: 'owner',
              dictionaryId: row.dictionaryId,
              learnerId: row.learnerId,
          }
        : { ...row.authority, learnerId: row.learnerId };
}

export function covered(batch: Batch) {
    return new Set(batch.manifest.flatMap((item) => item.entryIds));
}

export function presentBatch(batch: Batch): SentencePreparationBatch {
    const ids = covered(batch);

    return {
        id: batch.id,
        entryIds: batch.entries.map((entry) => entry.entryId),
        preparedEntryIds: batch.entries
            .filter((entry) => ids.has(entry.entryId))
            .map((entry) => entry.entryId),
        exerciseIds: batch.manifest.map((item) => item.exerciseId),
        state:
            ids.size === batch.entries.length
                ? 'ready'
                : ids.size
                  ? 'partial'
                  : 'pending',
    };
}

export interface SentencePreparationPersistenceContext {
    database: SentenceDatabase;
    policy: SentencePreparationPersistencePolicy;
}
