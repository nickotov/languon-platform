import { textAiTextFormats } from '../../../application/text-ai-provider-catalog';

export function textAiSelectionObservationId(
    workerId: string,
    providerId: string,
    modelId: string,
): string {
    return `${workerId}/${providerId}/${modelId}/text-ai-selection:v1`;
}

export function isTextAiSelectionCapableObservation(
    observation: {
        id: string;
        workerId: string;
        providerId: string;
        modelId: string;
        textAiSelectionRevision: number | null;
        textAiSupportedFormats: string[] | null;
    },
    format?: string,
): boolean {
    // Legacy publishers upsert the unversioned key without clearing unknown
    // columns. Its capability flag therefore cannot prove the running version.
    return (
        observation.textAiSelectionRevision === 1 &&
        Array.isArray(observation.textAiSupportedFormats) &&
        observation.textAiSupportedFormats.some(
            (supported) =>
                textAiTextFormats.some(
                    (registered) => registered === supported,
                ) &&
                (format === undefined || supported === format),
        ) &&
        observation.id ===
            textAiSelectionObservationId(
                observation.workerId,
                observation.providerId,
                observation.modelId,
            )
    );
}
