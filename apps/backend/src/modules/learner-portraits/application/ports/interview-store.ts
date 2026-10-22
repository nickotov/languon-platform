import type { ActionBilling } from '@languon/contracts';
import type {
    PortraitInterviewerOutput,
    PortraitInterviewCompletedOperation,
    PortraitInterviewActiveOperation,
    PortraitInterviewLastAttempt,
    PortraitItems,
    PortraitLocaleSchema,
    PortraitInterviewSubmissionSchema,
} from '@languon/contracts';
import type { z } from 'zod';

export type InterviewSubmission = z.infer<
    typeof PortraitInterviewSubmissionSchema
>;
export interface InterviewContext {
    locale: z.infer<typeof PortraitLocaleSchema>;
    approvedItems: PortraitItems | null;
    draftItems: PortraitItems | null;
    messages: { role: 'user' | 'assistant'; content: string }[];
    completedTopics: PortraitInterviewerOutput['topic'][];
}
export interface InterviewOperation {
    billing?: ActionBilling;
    id: string;
    interviewId: string;
    ownerId: string;
    generation: number;
    version: number;
    state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    input: InterviewSubmission;
    context: InterviewContext;
    execution: Record<string, unknown>;
    result: PortraitInterviewerOutput | null;
    errorCode: string | null;
}
export interface ClaimedInterviewOperation extends InterviewOperation {
    leaseToken: string;
}
export interface InterviewStore {
    /** Private read-only discovery; never creates an interview or refreshes activity. */
    status(
        ownerId: string,
        now: Date,
    ): Promise<{
        id: string;
        locale: InterviewContext['locale'];
        expiresAt: string;
    } | null>;
    /** Serializes against portrait writes; validates version/epoch and active interview, pins context and admission atomically. Replay never re-admits. */
    enqueue(input: {
        id: string;
        ownerId: string;
        interviewId: string;
        expectedVersion: number;
        expectedGeneration: number;
        idempotencyKey: string;
        input: InterviewSubmission;
        now: Date;
        paidAcknowledged: boolean;
    }): Promise<InterviewOperation>;
    /** Creates or resumes one interview, seeds only approved/current draft data. */
    start(input: {
        ownerId: string;
        locale: InterviewContext['locale'];
        expectedVersion: number;
        now: Date;
    }): Promise<{
        interviewId: string;
        expiresAt: string;
        context: InterviewContext;
        /** Latest validated question/options for cross-device resume. */
        currentQuestion?: PortraitInterviewerOutput;
        /** Explicitly pending proposal, separate from confirmed portrait items. */
        latestCompletedOperation?: PortraitInterviewCompletedOperation;
        activeOperation?: PortraitInterviewActiveOperation;
        /** Owner-only recoverable input for the latest failed/cancelled attempt. Never auto-retry. */
        lastAttempt?: PortraitInterviewLastAttempt;
    }>;
    setLocale(input: {
        ownerId: string;
        interviewId: string;
        locale: InterviewContext['locale'];
        expectedVersion: number;
        now: Date;
    }): Promise<{
        interviewId: string;
        expiresAt: string;
        context: InterviewContext;
    }>;
    read(ownerId: string, id: string): Promise<InterviewOperation | null>;
    stop(ownerId: string, id: string, now: Date): Promise<void>;
    claim(): Promise<ClaimedInterviewOperation | null>;
    /** Throws if stopped, expired, deleted, or lease lost. */
    heartbeat(operation: ClaimedInterviewOperation): Promise<void>;
    /** Writes transcript/proposal only: NEVER approves portrait or enables use. Reject stale version/generation; proposals remain explicit-review data. */
    complete(
        operation: ClaimedInterviewOperation,
        result: PortraitInterviewerOutput,
        now: Date,
    ): Promise<void>;
    fail(
        operation: ClaimedInterviewOperation,
        code: string,
        now: Date,
    ): Promise<void>;
}
export interface InterviewRunner {
    run(input: {
        operation: ClaimedInterviewOperation;
        signal: AbortSignal;
    }): Promise<PortraitInterviewerOutput>;
}

export class PortraitInterviewResourceLimitError extends Error {}
export class PortraitInterviewDailyQuotaError extends PortraitInterviewResourceLimitError {}

/** Safe category only: never retains provider text, prompt, validation issues or causes. */
export class PortraitInterviewInvalidModelOutputError extends Error {
    constructor() {
        super('The interview response did not match the required format.');
        this.name = 'PortraitInterviewInvalidModelOutputError';
    }
}
