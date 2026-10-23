import { type PortraitInterviewerOutput } from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    InterviewContext,
    InterviewOperation,
} from '../../../application/ports/interview-store';
import { PortraitInterviewResourceLimitError } from '../../../application/ports/interview-store';
import { PortraitDraftUnavailableError } from '../../../application/ports/portrait-store';
import {
    clearPortraitInterview,
    readPortraitState,
    savePortraitState,
    type PortraitDatabase,
    type PortraitTransaction,
} from './drizzle-portrait-store';
import { recoverExpiredPortraitOperations } from './portrait-deletion-participant';
import {
    learnerPortraitInterviewsTable as interviews,
    learnerPortraitInterviewOperationsTable as operations,
} from './schema';

export const ttl = 14 * 86400_000;

export const leaseMs = 60_000;

export const emptyContext = (): InterviewContext => ({
    locale: 'en',
    approvedItems: null,
    draftItems: null,
    messages: [],
    completedTopics: [],
});

export type Row = typeof operations.$inferSelect;

export function operation(row: Row): InterviewOperation {
    return {
        id: row.id,
        interviewId: row.interviewId,
        ownerId: row.ownerId,
        generation: row.generation,
        version: row.version,
        state: row.state,
        input: row.input,
        context: row.context,
        execution: row.execution,
        result: row.result,
        errorCode: row.errorCode,
    };
}

export type InterviewAdmission = (
    tx: PortraitTransaction,
    operation: InterviewOperation,
    paidAcknowledged: boolean,
    now: Date,
    request?: { requestKey: string; fingerprint: string },
) => Promise<Record<string, unknown>>;

export async function isInvalid(
    tx: PortraitTransaction,
    claim: Pick<
        InterviewOperation,
        'id' | 'interviewId' | 'ownerId' | 'generation' | 'version'
    >,
    now: Date,
) {
    const [row] = await tx
        .select()
        .from(operations)
        .where(eq(operations.id, claim.id));
    const [session] = await tx
        .select()
        .from(interviews)
        .where(eq(interviews.id, claim.interviewId));
    const state = await readPortraitState(tx, claim.ownerId);
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, claim.ownerId));

    return (
        owner?.status !== 'active' ||
        row?.cancelRequested ||
        !session ||
        session.expiresAt <= now ||
        state.generation !== claim.generation ||
        state.version !== claim.version
    );
}

export async function expireOwner(
    tx: PortraitTransaction,
    ownerId: string,
    now: Date,
) {
    const state = await readPortraitState(tx, ownerId);
    const [session] = await tx
        .select()
        .from(interviews)
        .where(eq(interviews.ownerId, ownerId));

    if (
        (state.draft && new Date(state.draft.expiresAt) <= now) ||
        (session && session.expiresAt <= now)
    ) {
        await clearPortraitInterview(tx, ownerId);
        await savePortraitState(
            tx,
            ownerId,
            {
                ...state,
                draft: null,
                generation: state.generation + 1,
                version: state.version + 1,
            },
            now,
        );
    }
}

export async function expireLearnerPortraitInterviews(
    database: PortraitDatabase,
    now = new Date(),
): Promise<number> {
    const rows = await database.execute(
        sql`select i.owner_id from learner_portrait_interviews i join users u on u.id=i.owner_id where expires_at<=${now.toISOString()}::timestamptz union select p.owner_id from learner_portraits p join users u on u.id=p.owner_id where draft_expires_at<=${now.toISOString()}::timestamptz union select o.owner_id from learner_portrait_interview_operations o where o.state='running' and o.lease_until<=${now.toISOString()}::timestamptz limit 100`,
    );
    let count = 0;
    for (const row of rows) {
        await database.transaction(async (tx) => {
            const ownerId = String(row.owner_id);
            await recoverExpiredPortraitOperations(tx, ownerId, now);
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, ownerId))
                .for('update');

            await expireOwner(tx, ownerId, now);
        });

        count++;
    }

    return count;
}

export async function assertLiveInterviewOperation(
    tx: PortraitTransaction,
    operationId: string,
    ownerId: string,
    now = new Date(),
): Promise<void> {
    const [row] = await tx
        .select()
        .from(operations)
        .where(
            and(
                eq(operations.id, operationId),
                eq(operations.ownerId, ownerId),
            ),
        );

    if (!row || row.state !== 'running' || (await isInvalid(tx, row, now)))
        throw new PortraitDraftUnavailableError();
}

export function validateContext(context: InterviewContext): void {
    if (Buffer.byteLength(JSON.stringify(context), 'utf8') > 135000)
        throw new PortraitInterviewResourceLimitError(
            'Interview context limit reached; review the portrait or begin a new interview.',
        );
}

/** Resume the question; confirmed items come exclusively from the current state,
 * never from an older generated proposal attached to this response. */
export function resumeQuestion(
    value: PortraitInterviewerOutput,
): PortraitInterviewerOutput {
    return {
        message: value.message,
        topic: value.topic,
        options: value.options,
        multiSelect: value.multiSelect,
        ...(value.locale ? { locale: value.locale } : {}),
        ...(value.redirect ? { redirect: value.redirect } : {}),
    };
}

export interface InterviewStoreContext {
    readonly database: PortraitDatabase;
    readonly admission: InterviewAdmission;
    readonly recover:
        | ((
              tx: PortraitTransaction,
              operationId: string,
              now: Date,
          ) => Promise<void>)
        | undefined;
}
