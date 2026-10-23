import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { and, desc, eq, gt } from 'drizzle-orm';
import { DictionaryGenerationJobNotFoundError } from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import type { DictionaryOperationContext } from '../../../application/ports/dictionary-store';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionarySettingsTable,
} from './schema';
import type {
    GenerationStoreContext,
    Transaction,
    JobRow,
} from './generation-context';
import { abort } from './generation-context';
import { mapJob } from './generation-job-mapping';

export async function read(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['read']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        abort(input.context);
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.id, input.jobId),
                    eq(dictionaryGenerationJobsTable.ownerId, input.ownerId),
                ),
            )
            .limit(1)
            .for('share');

        if (!job) throw new DictionaryGenerationJobNotFoundError();

        return readView(tx, job, input.context.now);
    });
}

export async function latestForCard(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['latestForCard']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        abort(input.context);
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.kind, 'single-card'),
                    eq(dictionaryGenerationJobsTable.ownerId, input.ownerId),
                    eq(
                        dictionaryGenerationJobsTable.dictionaryId,
                        input.dictionaryId,
                    ),
                    eq(dictionaryGenerationJobsTable.cardId, input.cardId),
                ),
            )
            .orderBy(
                desc(dictionaryGenerationJobsTable.createdAt),
                desc(dictionaryGenerationJobsTable.id),
            )
            .limit(1)
            .for('share');

        return job ? readView(tx, job, input.context.now) : null;
    });
}

export function workerCas(input: {
    context: DictionaryOperationContext;
    fencingToken: bigint;
    jobId: string;
    leaseDeadline: Date;
    workerId: string;
}) {
    return and(
        eq(dictionaryGenerationJobsTable.id, input.jobId),
        eq(dictionaryGenerationJobsTable.executionState, 'running'),
        eq(dictionaryGenerationJobsTable.workerId, input.workerId),
        eq(dictionaryGenerationJobsTable.fencingToken, input.fencingToken),
        eq(dictionaryGenerationJobsTable.leaseDeadline, input.leaseDeadline),
        gt(dictionaryGenerationJobsTable.leaseDeadline, input.context.now),
    );
}

export async function lockOwnedJob(
    tx: Transaction,
    ownerId: string,
    jobId: string,
) {
    const [job] = await tx
        .select()
        .from(dictionaryGenerationJobsTable)
        .where(
            and(
                eq(dictionaryGenerationJobsTable.id, jobId),
                eq(dictionaryGenerationJobsTable.ownerId, ownerId),
            ),
        )
        .for('update');

    if (!job) throw new DictionaryGenerationJobNotFoundError();

    return job;
}

export async function lockProposal(tx: Transaction, jobId: string) {
    const [proposal] = await tx
        .select()
        .from(dictionaryGenerationProposalsTable)
        .where(eq(dictionaryGenerationProposalsTable.jobId, jobId))
        .for('update');

    return proposal ?? null;
}

export async function lockCardSnapshot(tx: Transaction, job: JobRow) {
    const [current] = await tx
        .select({
            card: dictionaryCardsTable,
            dictionary: dictionariesTable,
            settings: dictionarySettingsTable,
        })
        .from(dictionariesTable)
        .innerJoin(
            dictionarySettingsTable,
            eq(dictionarySettingsTable.dictionaryId, dictionariesTable.id),
        )
        .innerJoin(
            dictionaryCardsTable,
            and(
                eq(dictionaryCardsTable.id, job.cardId!),
                eq(dictionaryCardsTable.dictionaryId, dictionariesTable.id),
            ),
        )
        .where(
            and(
                eq(dictionariesTable.id, job.dictionaryId),
                eq(dictionariesTable.ownerId, job.ownerId),
            ),
        )
        .for('update');

    if (!current) throw new DictionaryGenerationJobNotFoundError();

    return current;
}

export async function readView(tx: Transaction, job: JobRow, now: Date) {
    const [proposal] = await tx
        .select()
        .from(dictionaryGenerationProposalsTable)
        .where(eq(dictionaryGenerationProposalsTable.jobId, job.id))
        .limit(1)
        .for('update');

    if (
        proposal?.reviewState === 'reviewable' &&
        (!proposal.documentStagedAt || proposal.documentPublishedAt) &&
        proposal.expiresAt <= now
    ) {
        await expireProposal(tx, job.id, now);

        return withActionBilling(
            tx,
            mapJob(
                { ...job, inputPayload: null, updatedAt: now },
                {
                    ...proposal,
                    payload: null,
                    reviewState: 'expired',
                    terminalAt: now,
                    updatedAt: now,
                },
            ),
            job.id,
            job.ownerId,
        );
    }

    return withActionBilling(
        tx,
        mapJob(job, proposal ?? null),
        job.id,
        job.ownerId,
    );
}

export async function expireProposal(
    tx: Transaction,
    jobId: string,
    now: Date,
) {
    await tx
        .update(dictionaryGenerationProposalsTable)
        .set({
            payload: null,
            reviewState: 'expired',
            terminalAt: now,
            updatedAt: now,
        })
        .where(
            and(
                eq(dictionaryGenerationProposalsTable.jobId, jobId),
                eq(
                    dictionaryGenerationProposalsTable.reviewState,
                    'reviewable',
                ),
            ),
        );

    await tx
        .update(dictionaryGenerationJobsTable)
        .set({ inputPayload: null, updatedAt: now })
        .where(eq(dictionaryGenerationJobsTable.id, jobId));
}
