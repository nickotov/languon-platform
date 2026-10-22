import { initialInterviewQuestion } from './interview-questions';
import { randomUUID } from 'node:crypto';
import {
    StartPortraitInterviewSchema,
    SetPortraitInterviewLocaleSchema,
    SubmitPortraitInterviewSchema,
} from '@languon/contracts';
import type { z } from 'zod';
import type {
    InterviewStore,
    InterviewOperation,
} from './ports/interview-store';

export function publicInterviewOperation(operation: InterviewOperation) {
    return {
        ...(operation.billing ? { billing: operation.billing } : {}),
        id: operation.id,
        interviewId: operation.interviewId,
        state: operation.state,
        result: operation.result,
        errorCode: operation.errorCode,
    };
}
export class InterviewService {
    constructor(private readonly store: InterviewStore) {}
    status(ownerId: string, now = new Date()) {
        return this.store.status(ownerId, now);
    }
    async start(
        ownerId: string,
        request: z.infer<typeof StartPortraitInterviewSchema>,
        now = new Date(),
    ) {
        const { currentQuestion, ...session } = await this.store.start({
            ownerId,
            ...StartPortraitInterviewSchema.parse(request),
            now,
        });
        return {
            ...session,
            initialQuestion:
                currentQuestion ?? initialInterviewQuestion(session.context),
        };
    }
    setLocale(
        ownerId: string,
        request: z.infer<typeof SetPortraitInterviewLocaleSchema>,
        now = new Date(),
    ) {
        return this.store.setLocale({
            ownerId,
            ...SetPortraitInterviewLocaleSchema.parse(request),
            now,
        });
    }
    async submit(
        ownerId: string,
        request: z.input<typeof SubmitPortraitInterviewSchema>,
        now = new Date(),
    ) {
        const input = SubmitPortraitInterviewSchema.parse(request);
        return publicInterviewOperation(
            await this.store.enqueue({
                ...input,
                ownerId,
                id: randomUUID(),
                now,
            }),
        );
    }
    async read(ownerId: string, operationId: string) {
        const operation = await this.store.read(ownerId, operationId);
        return operation ? publicInterviewOperation(operation) : null;
    }
    async stop(ownerId: string, operationId: string, now = new Date()) {
        await this.store.stop(ownerId, operationId, now);
        return this.read(ownerId, operationId);
    }
}
