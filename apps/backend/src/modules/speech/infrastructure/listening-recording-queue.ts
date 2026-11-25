import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { LearningTranscriptSchema } from '@languon/contracts';
import { z } from 'zod';
import type { KnowledgeDatabase } from '../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import {
    listeningUtteranceSchema,
    type ListeningSpeechInput,
} from './audio/prepare-listening-recording';
import type { SpeechWorker } from '../application/speech-worker';
import { SpeechError } from '../domain/speech-policy';

const resultSchema = z.object({
    assetId: z.string().uuid(),
    transcript: LearningTranscriptSchema,
});

type ListeningResult = z.infer<typeof resultSchema>;
const scopeSchema = z.object({
    ownerId: z.string().uuid(),
    noteId: z.string().uuid(),
    branchId: z.string().uuid(),
    runId: z.string().uuid(),
    revision: z.number().int().positive(),
    taskId: z.string(),
    turnId: z.string().uuid(),
    leaseToken: z.string().uuid(),
    language: z.string(),
    utterances: z.array(listeningUtteranceSchema).min(1).max(8),
});

export class ListeningSpeechPending extends Error {
    constructor(readonly bindingId: string) {
        super('Listening utterance is pending.');
    }
}

/** Only the API can admit speech and publish note media. The worker sees its own fenced result. */
export function createWorkerListeningRequest(
    database: KnowledgeDatabase,
    worker: Pick<SpeechWorker, 'runOnce'>,
) {
    return async (input: ListeningSpeechInput): Promise<ListeningResult> => {
        for (;;) {
            input.signal?.throwIfAborted();
            const [row] =
                await database.execute(sql`select state,binding_id,result::text as result,failure_code from languon_request_listening_recording(
                ${input.runId}::uuid,${input.revision}::integer,${input.taskId}::text,${input.turnId}::uuid,${input.leaseToken}::uuid)`);

            if (!row) {
                throw new SpeechError('listening_authorization_expired');
            }

            if (row.state === 'ready') {
                return resultSchema.parse(JSON.parse(String(row.result)));
            }

            if (row.state === 'failed') {
                throw new SpeechError({
                    recordingFailure: String(row.failure_code),
                });
            }

            // A one-slot worker can advance its own private job while waiting for API publication.
            if (typeof row.binding_id === 'string') {
                await worker.runOnce(input.signal, row.binding_id);
            }

            await delay(1000, undefined, { signal: input.signal });
        }
    };
}

export function createListeningQueueProcessor(
    database: KnowledgeDatabase,
    prepare: (input: ListeningSpeechInput) => Promise<ListeningResult>,
) {
    return async (signal?: AbortSignal) => {
        const claimId = randomUUID();
        const [row] =
            await database.execute(sql`update listening_recording_preparations q set
            claim_id=${claimId}::uuid, due_at=clock_timestamp()+interval '45 seconds'
            where q.id=(select id from listening_recording_preparations where state='pending'
                and due_at<=clock_timestamp() order by due_at,id limit 1 for update skip locked)
            returning q.id,q.scope::text as scope,q.failures`);

        if (!row) {
            return;
        }

        const id = String(row.id);
        const claimed = sql`id=${id}::uuid and claim_id=${claimId}::uuid and state='pending'`;
        try {
            const scope = scopeSchema.parse(JSON.parse(String(row.scope)));
            const [active] =
                await database.execute(sql`select spec->>'maxDurationSeconds' as duration from conversation_turns t
                join conversation_generation_runs r on r.active_turn_id=t.id
                join conversation_generation_plan_revisions p on p.run_id=r.id and p.revision=r.revision
                cross join lateral jsonb_array_elements(p.plan->'tasks') spec
                where r.id=${scope.runId}::uuid and r.state='running' and r.revision=${scope.revision}
                  and spec->>'id'=${scope.taskId} and spec->>'kind'='audio'
                  and t.id=${scope.turnId}::uuid and t.lease_token=${scope.leaseToken}::uuid
                  and t.status='running' and not t.cancel_requested and t.lease_until>clock_timestamp()`);

            if (!active) {
                throw new SpeechError('listening_authorization_expired');
            }

            const result = await prepare({
                ...scope,
                ...(active.duration === null
                    ? {}
                    : {
                          maxDurationSeconds: z.coerce
                              .number()
                              .int()
                              .min(1)
                              .max(120)
                              .parse(active.duration),
                      }),
                ...(signal ? { signal } : {}),
            });

            await database.execute(sql`update listening_recording_preparations set state='ready', scope=null,
                result=${JSON.stringify(result)}::jsonb, binding_id=null, claim_id=null where ${claimed}`);
        } catch (error) {
            if (signal?.aborted) {
                throw error;
            }

            if (error instanceof ListeningSpeechPending) {
                await database.execute(sql`update listening_recording_preparations set binding_id=${error.bindingId}::uuid,
                    due_at=clock_timestamp()+interval '1 second',claim_id=null where ${claimed}`);
            } else if (
                (error instanceof SpeechError &&
                    error.kind !== 'capacity_limited' &&
                    error.kind !== 'unavailable') ||
                error instanceof z.ZodError ||
                Number(row.failures) >= 2
            ) {
                const code =
                    error instanceof SpeechError
                        ? error.code
                        : error instanceof z.ZodError
                          ? 'speech_source_changed'
                          : 'speech_recording_unavailable';

                await database.execute(sql`update listening_recording_preparations set state='failed',scope=null,
                    failure_code=${code},binding_id=null,claim_id=null where ${claimed}`);
            } else {
                await database.execute(sql`update listening_recording_preparations set failures=failures+1,
                    due_at=clock_timestamp()+interval '3 seconds',claim_id=null where ${claimed}`);
            }
        }
    };
}
