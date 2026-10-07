import { createHash } from 'node:crypto';
import { textAiTextFormats } from '../../../application/text-ai-provider-catalog';

export function textAiSelectionObservationId(
    workerId: string,
    providerId: string,
    modelId: string,
): string {
    return `${workerId}/${providerId}/${modelId}/text-ai-selection:v1`;
}
function identity(
    workerId: string,
    providerId: string,
    modelId: string,
): string {
    return createHash('sha256')
        .update(workerId)
        .update('\0')
        .update(providerId)
        .update('\0')
        .update(modelId)
        .digest('hex');
}
export function textAiCapacityObservationId(
    workerId: string,
    providerId: string,
    modelId: string,
): string {
    return `text-ai-capacity:v1/${identity(workerId, providerId, modelId)}`;
}
export function sentenceExecutionObservationId(
    workerId: string,
    providerId: string,
    modelId: string,
): string {
    return `sentence-execution:v1/${identity(workerId, providerId, modelId)}`;
}
interface WorkerCapabilityObservation {
    id: string;
    workerId: string;
    providerId: string;
    modelId: string;
    textAiSelectionRevision: number | null;
    textAiSupportedFormats: string[] | null;
    textAiCapacityRevision?: number | null;
    learningExecutionRevision?: number | null;
    creditSettlementRevision?: number | null;
}
function supports(
    observation: WorkerCapabilityObservation,
    format?: string,
): boolean {
    return (
        observation.textAiSelectionRevision === 1 &&
        Array.isArray(observation.textAiSupportedFormats) &&
        observation.textAiSupportedFormats.some(
            (supported) =>
                textAiTextFormats.some(
                    (registered) => registered === supported,
                ) &&
                (format === undefined || supported === format),
        )
    );
}
export function isTextAiCapacityCapableObservation(
    observation: WorkerCapabilityObservation,
    format?: string,
): boolean {
    return (
        supports(observation, format) &&
        observation.textAiCapacityRevision === 1 &&
        observation.id ===
            textAiCapacityObservationId(
                observation.workerId,
                observation.providerId,
                observation.modelId,
            )
    );
}
export function isSentenceExecutionCapableObservation(
    observation: WorkerCapabilityObservation,
    format?: string,
): boolean {
    const preparationBase =
        format === 'sentence-preparation:v1'
            ? 'sentence-generation:v1'
            : format === 'sentence-preparation:v2'
              ? 'sentence-generation:v2'
              : undefined;
    const formatSupported = preparationBase
        ? supports(observation, preparationBase) &&
          observation.textAiSupportedFormats!.includes(format!)
        : supports(observation, format);
    return (
        formatSupported &&
        observation.textAiCapacityRevision === 1 &&
        observation.learningExecutionRevision === 1 &&
        observation.creditSettlementRevision === 1 &&
        observation.id ===
            sentenceExecutionObservationId(
                observation.workerId,
                observation.providerId,
                observation.modelId,
            )
    );
}
export function isTextAiSelectionCapableObservation(
    observation: WorkerCapabilityObservation,
    format?: string,
): boolean {
    // Every capability generation has a noncolliding namespace. A legacy upsert
    // cannot refresh unknown learning/capacity columns into evidence for new work.
    return (
        supports(observation, format) &&
        (observation.id ===
            textAiSelectionObservationId(
                observation.workerId,
                observation.providerId,
                observation.modelId,
            ) ||
            isTextAiCapacityCapableObservation(observation, format) ||
            isSentenceExecutionCapableObservation(observation, format))
    );
}
