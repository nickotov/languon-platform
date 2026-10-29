import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { TextTranslationProposalSchema } from '@languon/contracts';
import type {
    TextJobResult,
    TextsTokenUsage,
} from '../../../../src/modules/texts/application/ports/texts-ai-provider';
import type {
    TextJobContext,
    TextsLease,
} from '../../../../src/modules/texts/application/ports/texts-job-store';
import type { TextsDatabase } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-support';
import { textsAiJobsTable as jobs } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-schema';
import { transaction } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-admission';
import { settleTextsAttempt } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-accounting';

/** Exercise authority after the real SDK has persisted its native observation,
 * inside production financial transactions; every probe rolls back. */
export async function verifyPrivateTranslationBeforeCompletion(input: {
    workerDatabase: TextsDatabase;
    inspectionDatabase: TextsDatabase;
    lease: TextsLease;
    result: TextJobResult;
    usage: TextsTokenUsage | undefined;
    context: TextJobContext;
    peerToken: string;
}) {
    const { lease } = input;
    const proposal = TextTranslationProposalSchema.parse(input.result);
    const token = lease.privateCompletionToken;
    if (!token)
        throw new Error(
            'The real private claim must return its opaque capability.',
        );
    const invoke = async (
        candidate: unknown,
        candidateToken = token,
        fence = lease.fencingToken,
        rollback = false,
    ) =>
        transaction(
            { database: input.workerDatabase, policy: undefined },
            async (tx) => {
                const [job] = await tx
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, lease.jobId))
                    .for('update');
                if (!job) throw new Error('Missing real private job.');
                await settleTextsAttempt(
                    tx,
                    job,
                    input.context.now,
                    input.usage,
                    'success',
                );
                await tx.execute(
                    sql`select languon_complete_private_knowledge_translation(${lease.jobId}::uuid,${job.ownerId}::uuid,${lease.workerId},${fence}::bigint,${candidateToken}::uuid,${JSON.stringify(candidate)}::jsonb)`,
                );
                if (rollback)
                    throw new Error(
                        'Deliberate private publication transaction rollback.',
                    );
            },
        );

    await expect(
        input.workerDatabase.execute(
            sql`select * from knowledge_translation_completion_capabilities`,
        ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(
        input.workerDatabase.execute(
            sql`select * from knowledge_translation_publication_receipts`,
        ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(
        invoke({ ...proposal, targetLanguage: 'de' }),
    ).rejects.toMatchObject({
        cause: {
            code: '23514',
            message: expect.stringContaining('immutable requested target'),
        },
    });
    await expect(
        invoke({ ...proposal, id: randomUUID() }),
    ).rejects.toMatchObject({
        cause: {
            code: '23514',
            message: expect.stringContaining('immutable requested target'),
        },
    });
    await expect(
        invoke({
            ...proposal,
            alignment: {
                ...proposal.alignment,
                translation: [...proposal.alignment.translation].reverse(),
            },
        }),
    ).rejects.toMatchObject({
        cause: {
            code: '23514',
            message: expect.stringContaining('ordered passages'),
        },
    });
    await expect(invoke(proposal, input.peerToken)).rejects.toMatchObject({
        cause: {
            code: '23514',
            message: expect.stringContaining('one-shot claim capability'),
        },
    });
    await expect(
        invoke(proposal, token, String(BigInt(lease.fencingToken) + 1n)),
    ).rejects.toMatchObject({
        cause: {
            code: '23514',
            message: expect.stringContaining('one-shot claim capability'),
        },
    });
    await expect(
        invoke(proposal, token, lease.fencingToken, true),
    ).rejects.toThrow('Deliberate private publication transaction rollback.');
    const [capability] = await input.inspectionDatabase.execute(
        sql`select consumed_at from knowledge_translation_completion_capabilities where job_id=${lease.jobId}::uuid`,
    );
    expect(capability?.consumed_at).toBeNull();
    const [receipt] = await input.inspectionDatabase.execute(
        sql`select count(*)::integer as count from knowledge_translation_publication_receipts where job_id=${lease.jobId}::uuid`,
    );
    expect(receipt?.count).toBe(0);
}

export async function verifyPrivateTranslationAfterCompletion(input: {
    workerDatabase: TextsDatabase;
    inspectionDatabase: TextsDatabase;
    lease: TextsLease;
    result: TextJobResult;
}) {
    const proposal = TextTranslationProposalSchema.parse(input.result);
    const [job] = await input.inspectionDatabase
        .select()
        .from(jobs)
        .where(eq(jobs.id, input.lease.jobId));
    if (!job) throw new Error('Missing real completed private job.');
    await expect(
        input.workerDatabase.execute(
            sql`update texts_ai_jobs set result_payload=${JSON.stringify({ ...proposal, targetLanguage: 'de' })}::jsonb where id=${job.id}::uuid`,
        ),
    ).rejects.toMatchObject({
        cause: {
            code: '23514',
            message: expect.stringContaining('terminal facts are immutable'),
        },
    });
    await expect(
        input.workerDatabase.execute(
            sql`update texts_ai_jobs set completed_at=clock_timestamp()+interval '100 years' where id=${job.id}::uuid`,
        ),
    ).rejects.toMatchObject({
        cause: {
            code: '23514',
            message: expect.stringContaining('terminal facts are immutable'),
        },
    });
    for (const direction of ['100 years', '-100 years']) {
        await expect(
            input.workerDatabase.execute(
                sql`update texts_ai_jobs set expires_at=clock_timestamp()+${direction}::interval where id=${job.id}::uuid`,
            ),
        ).rejects.toMatchObject({
            cause: {
                code: '23514',
                message: expect.stringContaining(
                    'retention and identity are immutable',
                ),
            },
        });
    }
    await expect(
        input.workerDatabase.execute(
            sql`select languon_complete_private_knowledge_translation(${job.id}::uuid,${job.ownerId}::uuid,${input.lease.workerId},${input.lease.fencingToken}::bigint,${input.lease.privateCompletionToken!}::uuid,${JSON.stringify(proposal)}::jsonb)`,
        ),
    ).rejects.toMatchObject({
        cause: {
            code: '23514',
            message: expect.stringContaining('one-shot claim capability'),
        },
    });
    await expect(
        input.workerDatabase.execute(
            sql`select languon_issue_private_translation_lease(${job.id}::uuid,${input.lease.workerId},${input.lease.fencingToken}::bigint)`,
        ),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
        input.workerDatabase.execute(
            sql`select languon_publish_private_knowledge_translation(${job.id}::uuid,${job.ownerId}::uuid,${input.lease.workerId},${input.lease.fencingToken}::bigint,${JSON.stringify(proposal)}::jsonb,clock_timestamp()+interval '100 years')`,
        ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(
        input.workerDatabase.execute(
            sql`update knowledge_text_job_sources set requested_target_language='de' where job_id=${job.id}::uuid`,
        ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    const [redacted] = await input.workerDatabase.execute(
        sql`select input_payload,result_payload from texts_ai_jobs where id=${job.id}::uuid`,
    );
    expect(redacted).toMatchObject({
        input_payload: null,
        result_payload: null,
    });
    const [receipt] = await input.inspectionDatabase.execute(
        sql`select target_language,published_at from knowledge_translation_publication_receipts where job_id=${job.id}::uuid`,
    );
    expect(receipt?.target_language).toBe(proposal.targetLanguage);
    expect(
        new Date(String(receipt?.published_at)).getTime(),
    ).toBeLessThanOrEqual(Date.now());
}
