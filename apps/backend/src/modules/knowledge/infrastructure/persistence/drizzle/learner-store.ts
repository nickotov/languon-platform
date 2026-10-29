import {
    readLearningEpochs,
    requireLearningEpoch,
    learningExerciseRevision,
    type LearningEpochMap,
} from './learning-epochs';
import { readLearnerWorkbookProgress } from './learner-workbook-progress';
import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import {
    KnowledgeBodySchema,
    WorkbookLearnerAttemptSchema,
    WorkbookLearningEventSchema,
    WorkbookLearningStateSchema,
    WorkbookNoteCompletionSchema,
    type LearningBlock,
    type SubmitWorkbookAttemptRequest,
    type RecordWorkbookLearningEventRequest,
    type SetWorkbookNoteCompletionRequest,
} from '@languon/contracts';
import type {
    LearnerStore,
    LearnerSourceAccess,
} from '../../../application/learner-store';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import {
    evaluateWorkbookAnswer,
    exerciseSemanticRevision,
    noteUpdatedSinceCompletion,
    WorkbookLearningError,
} from '../../../domain/workbook-learning';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import type {
    KnowledgeDatabase,
    KnowledgeTransaction,
} from './knowledge-transaction';
import { readLearnerNote } from './learner-access';
import {
    knowledgeLearnerAttemptsTable as attempts,
    knowledgeLearnerEventsTable as events,
    knowledgeLearnerCompletionTable as completions,
    knowledgeLearnerCompletionReceiptsTable as receipts,
} from './learner-schema';

function fingerprint(noteId: string, value: unknown) {
    return createHash('sha256')
        .update(JSON.stringify({ noteId, value }))
        .digest('hex');
}

function conflict(
    message = 'The learning content changed. Reload before continuing.',
): never {
    throw new KnowledgeDomainError('version_conflict', message);
}

function replay<T extends { fingerprint: string; result: unknown }>(
    row: T | undefined,
    expected: string,
) {
    if (row && row.fingerprint !== expected)
        throw new KnowledgeDomainError(
            'idempotency_conflict',
            'This request identity was already used with different content.',
        );

    return row;
}

function blocks(body: unknown): LearningBlock[] {
    const parsed = KnowledgeBodySchema.parse(body);
    if (parsed.schemaVersion === 1) return [];

    return (parsed.document.content ?? []).flatMap((node) =>
        node.type === 'learningBlock' && node.attrs?.block
            ? [node.attrs.block]
            : [],
    );
}

function exercise(
    all: LearningBlock[],
    id: string,
    expected: string,
    revisions: LearningEpochMap,
    noteId: string,
) {
    const found = all.find((block) => block.id === id);
    if (!found || found.type !== 'exercise') conflict();
    const epoch = requireLearningEpoch(
        revisions,
        'exercise',
        id,
        id,
        exerciseSemanticRevision(found, all),
    );

    if (learningExerciseRevision(noteId, epoch) !== expected) conflict();

    return found;
}

function expectedVersion(current: number, expected: number) {
    if (current !== expected) conflict();
}

export class DrizzleLearnerStore implements LearnerStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly crypto: KnowledgeShareCrypto,
    ) {}

    workbookProgress(
        actorId: string,
        workbookId: string,
        access?: LearnerSourceAccess,
    ) {
        return this.database.transaction((tx) =>
            readLearnerWorkbookProgress(
                tx,
                this.crypto,
                actorId,
                workbookId,
                access,
            ),
        );
    }

    read(actorId: string, noteId: string, access?: LearnerSourceAccess) {
        return this.database.transaction(async (tx) => {
            const note = await readLearnerNote(
                tx,
                this.crypto,
                actorId,
                noteId,
                access,
            );
            const all = blocks(note.body);
            const epochs = await readLearningEpochs(tx, noteId);
            const history = await tx
                .select()
                .from(attempts)
                .where(
                    and(
                        eq(attempts.actorId, actorId),
                        eq(attempts.noteId, noteId),
                    ),
                )
                .orderBy(desc(attempts.createdAt), desc(attempts.id))
                .limit(101);
            const observations = await tx
                .select()
                .from(events)
                .where(
                    and(eq(events.actorId, actorId), eq(events.noteId, noteId)),
                )
                .orderBy(desc(events.createdAt), desc(events.id))
                .limit(101);
            const [completion] = await tx
                .select()
                .from(completions)
                .where(
                    and(
                        eq(completions.actorId, actorId),
                        eq(completions.noteId, noteId),
                    ),
                );

            return WorkbookLearningStateSchema.parse({
                noteId,
                noteVersion: note.version,
                attempts: history.slice(0, 100).map((row) => row.result),
                events: observations.slice(0, 100).map((row) => row.result),
                completion: completion?.result ?? null,
                updatedSinceCompletion: completion
                    ? noteUpdatedSinceCompletion(
                          completion.result.completedNoteVersion,
                          note.version,
                      )
                    : false,
                exerciseRevisions: all.flatMap((block) =>
                    block.type === 'exercise'
                        ? [
                              {
                                  exerciseId: block.id,
                                  revision: learningExerciseRevision(
                                      noteId,
                                      requireLearningEpoch(
                                          epochs,
                                          'exercise',
                                          block.id,
                                          block.id,
                                          exerciseSemanticRevision(block, all),
                                      ),
                                  ),
                              },
                          ]
                        : [],
                ),
                truncated: history.length > 100 || observations.length > 100,
            });
        });
    }

    attempt(
        actorId: string,
        noteId: string,
        input: SubmitWorkbookAttemptRequest,
        access?: LearnerSourceAccess,
    ) {
        return this.database.transaction(async (tx) => {
            const note = await readLearnerNote(
                tx,
                this.crypto,
                actorId,
                noteId,
                access,
            );
            const print = fingerprint(noteId, input);
            const [existing] = await tx
                .select()
                .from(attempts)
                .where(
                    and(
                        eq(attempts.actorId, actorId),
                        eq(attempts.id, input.id),
                    ),
                );

            if (replay(existing, print))
                return WorkbookLearnerAttemptSchema.parse(existing!.result);
            expectedVersion(note.version, input.noteVersion);
            const all = blocks(note.body);
            const target = exercise(
                all,
                input.exerciseId,
                input.exerciseRevision,
                await readLearningEpochs(tx, noteId),
                noteId,
            );
            let evaluation;
            try {
                evaluation = evaluateWorkbookAnswer(target, input.answer);
            } catch (error) {
                if (error instanceof WorkbookLearningError)
                    throw new KnowledgeDomainError(
                        'invalid_request',
                        error.message,
                    );

                throw error;
            }

            const now = new Date();
            const result = WorkbookLearnerAttemptSchema.parse({
                ...input,
                noteId,
                evaluation,
                createdAt: now.toISOString(),
            });
            const snapshot = all.filter(
                (block) =>
                    block.id === target.id ||
                    block.id === target.source?.blockId,
            );

            await tx.insert(attempts).values({
                actorId,
                noteId,
                id: input.id,
                exerciseId: target.id,
                exerciseRevision: input.exerciseRevision,
                noteVersion: note.version,
                result,
                snapshot,
                fingerprint: print,
                createdAt: now,
            });

            return result;
        });
    }

    event(
        actorId: string,
        noteId: string,
        input: RecordWorkbookLearningEventRequest,
        access?: LearnerSourceAccess,
    ) {
        return this.database.transaction(async (tx) => {
            const note = await readLearnerNote(
                tx,
                this.crypto,
                actorId,
                noteId,
                access,
            );
            const print = fingerprint(noteId, input);
            const [existing] = await tx
                .select()
                .from(events)
                .where(
                    and(eq(events.actorId, actorId), eq(events.id, input.id)),
                );

            if (replay(existing, print))
                return WorkbookLearningEventSchema.parse(existing!.result);
            expectedVersion(note.version, input.noteVersion);
            const all = blocks(note.body);
            const target = all.find((block) => block.id === input.blockId);
            if (input.kind === 'transcript-revealed') {
                if (
                    !target ||
                    !['audio', 'video'].includes(target.type) ||
                    !('transcript' in target) ||
                    !target.transcript
                )
                    conflict();
            } else {
                exercise(
                    all,
                    input.blockId,
                    input.exerciseRevision!,
                    await readLearningEpochs(tx, noteId),
                    noteId,
                );
            }

            const now = new Date();
            const result = WorkbookLearningEventSchema.parse({
                ...input,
                noteId,
                createdAt: now.toISOString(),
            });

            await tx.insert(events).values({
                actorId,
                noteId,
                id: input.id,
                result,
                fingerprint: print,
                createdAt: now,
            });

            return result;
        });
    }

    complete(
        actorId: string,
        noteId: string,
        input: SetWorkbookNoteCompletionRequest,
        access?: LearnerSourceAccess,
    ) {
        return this.database.transaction(async (tx) => {
            const note = await readLearnerNote(
                tx,
                this.crypto,
                actorId,
                noteId,
                access,
            );
            const print = fingerprint(noteId, input);
            const [existing] = await tx
                .select()
                .from(receipts)
                .where(
                    and(
                        eq(receipts.actorId, actorId),
                        eq(receipts.id, input.id),
                    ),
                );

            if (replay(existing, print)) return existing!.result;
            expectedVersion(note.version, input.noteVersion);
            const result = input.completed
                ? WorkbookNoteCompletionSchema.parse({
                      noteId,
                      completedNoteVersion: note.version,
                      completedAt: new Date().toISOString(),
                  })
                : null;

            await this.writeCompletion(tx, actorId, noteId, result);
            await tx.insert(receipts).values({
                actorId,
                noteId,
                id: input.id,
                request: input,
                result,
                fingerprint: print,
            });

            return result;
        });
    }

    private async writeCompletion(
        tx: KnowledgeTransaction,
        actorId: string,
        noteId: string,
        result: ReturnType<typeof WorkbookNoteCompletionSchema.parse> | null,
    ) {
        if (!result) {
            await tx
                .delete(completions)
                .where(
                    and(
                        eq(completions.actorId, actorId),
                        eq(completions.noteId, noteId),
                    ),
                );

            return;
        }

        await tx
            .insert(completions)
            .values({ actorId, noteId, result })
            .onConflictDoUpdate({
                target: [completions.actorId, completions.noteId],
                set: { result },
            });
    }
}
