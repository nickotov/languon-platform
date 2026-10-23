import { type SentencePreparation } from '@languon/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import { formatCreditMilli } from '../../../../ai-credits/domain/exact-credit-amount';
import {
    aiCreditActionsTable as accountingActions,
    aiCreditActionAttemptsTable as accountingAttempts,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import {
    sentenceGlobalVisibilityTable as global,
    sentencePersonalVisibilityTable as personal,
} from './sentence-library-schema';
import {
    authorizeSentence,
    isSentenceCurrent,
    sentenceCandidates,
    type SentenceTransaction,
} from './sentence-persistence-support';
import { sentencePreparationBatchesTable as batches } from './sentence-preparation-schema';
import type { Batch, Preparation } from './sentence-preparation-state';
import {
    accessFor,
    covered,
    presentBatch,
    type SentencePreparationPersistenceContext,
} from './sentence-preparation-state';

export async function sentencePreparationRows(
    tx: SentenceTransaction,
    id: string,
) {
    return tx
        .select()
        .from(batches)
        .where(eq(batches.preparationId, id))
        .orderBy(asc(batches.ordinal));
}

export async function sentencePreparationPresent(
    persistence: SentencePreparationPersistenceContext,
    tx: SentenceTransaction,
    row: Preparation,
    visiblePartitions?: Batch[],
): Promise<SentencePreparation> {
    const partitions =
        visiblePartitions ?? (await sentencePreparationRows(tx, row.id));
    const [parent] = row.currentActionId
        ? await tx
              .select()
              .from(accountingActions)
              .where(eq(accountingActions.id, row.currentActionId))
        : [];
    const calls = parent
        ? await tx
              .select()
              .from(accountingAttempts)
              .where(eq(accountingAttempts.actionId, parent.id))
        : [];
    const remainingOutputTokens = parent
        ? Math.max(
              0,
              parent.outputLimit -
                  calls.reduce(
                      (sum, call) =>
                          sum + (call.outputTokens ?? call.outputLimit),
                      0,
                  ),
          )
        : 0;

    return {
        ...(parent
            ? {
                  billing: {
                      state:
                          parent.funding !== 'customer'
                              ? ('free' as const)
                              : parent.state === 'active'
                                ? ('held' as const)
                                : parent.chargedMilli
                                  ? ('charged' as const)
                                  : ('released' as const),
                      heldCredits: formatCreditMilli(parent.heldMilli),
                      chargedCredits:
                          parent.chargedMilli === null
                              ? null
                              : formatCreditMilli(parent.chargedMilli),
                      measurement: parent.measurement,
                  },
                  remainingOutputTokens,
                  requiresNewBudget:
                      parent.state !== 'active' ||
                      parent.deadlineAt <= new Date() ||
                      calls.length >= 5 ||
                      remainingOutputTokens === 0,
              }
            : {}),
        id: row.id,
        dictionaryId: row.dictionaryId,
        direction: row.direction,
        mode: row.mode,
        state: row.state,
        pauseReason: row.pauseReason,
        eligibleCount: partitions.reduce(
            (sum, batch) => sum + batch.entries.length,
            0,
        ),
        preparedCount: partitions.reduce(
            (sum, batch) => sum + covered(batch).size,
            0,
        ),
        reusedExerciseCount: partitions.reduce(
            (sum, batch) =>
                sum +
                batch.manifest.filter((item) => item.origin === 'saved').length,
            0,
        ),
        generatedExerciseCount: partitions.reduce(
            (sum, batch) =>
                sum +
                batch.manifest.filter((item) => item.origin === 'generated')
                    .length,
            0,
        ),
        initialBatch: partitions[0] ? presentBatch(partitions[0]) : null,
        batchCount: partitions.length,
        activeJobId: row.activeJobId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export async function sentencePreparationVisible(
    tx: SentenceTransaction,
    learnerId: string,
    exerciseId: string,
) {
    const [hidden] = await tx
        .select()
        .from(personal)
        .where(
            and(
                eq(personal.learnerId, learnerId),
                eq(personal.exerciseId, exerciseId),
                sql`${personal.archivedAt} is not null`,
            ),
        );
    const [globallyHidden] = await tx
        .select()
        .from(global)
        .where(
            and(
                eq(global.exerciseId, exerciseId),
                sql`${global.archivedAt} is not null`,
            ),
        );

    return !hidden && !globallyHidden;
}

export async function sentencePreparationFresh(
    tx: SentenceTransaction,
    row: Preparation,
    partitions: Batch[],
) {
    if (!partitions.length) return false;
    const { dictionary } = await authorizeSentence(tx, accessFor(row));
    const source =
        row.direction === 'source-to-target'
            ? dictionary.sourceLanguageTag
            : dictionary.targetLanguageTag;
    const target =
        row.direction === 'source-to-target'
            ? dictionary.targetLanguageTag
            : dictionary.sourceLanguageTag;

    if (source !== row.sourceLanguage || target !== row.targetLanguage)
        return false;
    const current = (
        await sentenceCandidates(
            tx,
            row.dictionaryId,
            { type: 'all' },
            row.direction,
            row.learnerId,
        )
    ).candidates;

    return partitions.every((batch) =>
        batch.entries.every((entry) =>
            current.some(
                (candidate) =>
                    candidate.entryId === entry.entryId &&
                    candidate.learningVersion === entry.learningVersion &&
                    candidate.sourceText === entry.sourceText &&
                    candidate.targetText === entry.targetText,
            ),
        ),
    );
}

export async function sentencePreparationRefreshManifest(
    persistence: SentencePreparationPersistenceContext,
    tx: SentenceTransaction,
    row: Preparation,
    batch: Batch,
    persist = true,
) {
    const manifest: Batch['manifest'] = [];
    for (const item of batch.manifest) {
        if (
            (await sentencePreparationVisible(
                tx,
                row.learnerId,
                item.exerciseId,
            )) &&
            (await isSentenceCurrent(tx, item.exerciseId))
        )
            manifest.push(item);
    }

    if (manifest.length !== batch.manifest.length) {
        if (persist)
            await tx
                .update(batches)
                .set({
                    manifest,
                    ...(row.mode !== 'new-only'
                        ? { reviewed: false, scanCursor: null }
                        : {}),
                })
                .where(eq(batches.id, batch.id));
        batch.manifest = manifest;
        if (row.mode !== 'new-only') {
            batch.reviewed = false;
            batch.scanCursor = null;
        }
    }
}
