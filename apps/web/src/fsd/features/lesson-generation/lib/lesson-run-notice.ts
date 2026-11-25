import type { GenerationRunSummary } from '@languon/contracts';
import type { lessonRunCopy } from './lesson-run-copy';

export function lessonRunNotice(
    run: GenerationRunSummary,
    copy: ReturnType<typeof lessonRunCopy>,
    stopping: boolean,
    reconnecting: boolean,
): string | undefined {
    if (stopping) {
        return copy.stopping;
    }

    if (run.automation?.enabled && run.automation.retryAt) {
        return copy.predispatchRetry;
    }

    if (run.automation?.enabled && run.automation.recoveringTaskId) {
        return copy.repairing;
    }

    if (run.failure?.recoveryExhausted) {
        return copy.recoveryExhausted;
    }

    if (run.failure?.code === 'admission-blocked') {
        const reasons = {
            'context-too-large': copy.inputTooLarge,
            'allowance-required': copy.allowanceRequired,
            'authority-expired': copy.authorityExpired,
            'stage-limit': copy.stageLimit,
            balance: copy.balance,
            capacity: copy.serviceCapacity,
            'provider-capacity': copy.providerCapacity,
            'operator-capacity': copy.operatorCapacity,
            'response-active': copy.turnActive,
            configuration: copy.authorityConfig,
            'speech-voice-unavailable': copy.voiceUnavailable,
            'speech-decoder-unavailable': copy.decoderUnavailable,
            'recording-too-long': copy.recordingTooLong,
            'source-unavailable': copy.sourceUnavailable,
            'source-changed': copy.sourceChanged,
            conflict: copy.reviewCurrent,
            unknown: copy.error,
        };

        return reasons[run.failure.admissionReason ?? 'unknown'];
    }

    if (run.pauseReason === 'technical-failure') {
        const failure = run.failure;
        if (
            failure?.code === 'provider-rejected' &&
            failure.finishReason === 'content-filter'
        ) {
            return copy.failureFiltered;
        }

        if (
            failure?.phase === 'receipt' &&
            failure.code !== 'provider-outcome-unknown'
        ) {
            return copy.failureReceipt;
        }

        if (failure?.phase === 'checkpoint' && failure.code === 'publication') {
            return copy.failureCheckpoint;
        }

        if (
            failure &&
            ['schema-invalid', 'content-invalid'].includes(failure.code) &&
            run.tasks.some(
                (task) => task.id === failure.taskId && task.kind === 'prose',
            )
        ) {
            return copy.failureReading;
        }

        const answerKeyFailure =
            ['schema-invalid', 'content-invalid'].includes(
                run.failure?.code ?? '',
            ) &&
            run.failure?.paths?.some((path) =>
                /(?:^|\.)semantics\.checking\.key(?:\.|$)/u.test(path),
            );

        if (answerKeyFailure) {
            return copy.failureAnswerKey;
        }

        const failures = {
            'output-limit': copy.failureOutput,
            'schema-invalid': copy.failureSchema,
            'content-invalid': copy.failureContent,
            'rate-limited': copy.failureRateLimited,
            transport: copy.failureTransport,
            'provider-rejected': copy.providerRejected,
            'provider-outcome-unknown': copy.outcomeUnknown,
            interrupted: copy.interrupted,
            publication: copy.failurePublication,
            unknown: copy.failureUnknown,
        };

        return run.failure ? failures[run.failure.code] : copy.failed;
    }

    if (reconnecting) {
        return copy.reconnecting;
    }

    if (run.state === 'paused' && run.automation?.enabled) {
        return copy.automatic;
    }

    const reasons = {
        'recording-confirmation': undefined,
        budget: copy.budget,
        'technical-failure': copy.failed,
        interrupted: copy.interrupted,
        stopped: copy.stopped,
        'source-changed': copy.sourceChanged,
    };

    return run.pauseReason ? reasons[run.pauseReason] : undefined;
}
