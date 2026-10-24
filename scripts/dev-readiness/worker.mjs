import { tsImport } from 'tsx/esm/api';

// Reuse actual admission identity/revision predicates, not a second readiness model.
const readiness = await tsImport(
    '../../apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness.ts',
    import.meta.url,
);
const { textAiModelCatalog } = await tsImport(
    '../../apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts',
    import.meta.url,
);

export function selectedModel(snapshot, capability) {
    const id =
        snapshot.learner?.mode === 'explicit'
            ? snapshot.learner.model_id
            : ['conversation', 'interview'].includes(capability.id)
              ? 'deepseek-flash'
              : snapshot.configuration?.modelId;
    return textAiModelCatalog.find((model) => model.id === id);
}

export function workerSupports(worker, model, capability, format) {
    if (
        !model ||
        worker.model_id !== model.id ||
        worker.provider_id !== model.providerId ||
        worker.adapter_revision !== model.adapterRevision ||
        worker.status !== 'available'
    )
        return false;
    const observation = Object.fromEntries(
        Object.entries(worker).map(([key, value]) => [
            key.replace(/_([a-z])/g, (_, character) => character.toUpperCase()),
            value,
        ]),
    );
    const predicate =
        capability.id === 'texts'
            ? readiness.isTextsExecutionCapableObservation
            : capability.id === 'sentences'
              ? readiness.isSentenceExecutionCapableObservation
              : ['conversation', 'interview'].includes(capability.id)
                ? readiness.isConversationExecutionCapableObservation
                : readiness.isTextAiCapacityCapableObservation;
    return predicate(observation, format);
}

export function customerFunded(snapshot, capability) {
    const name = {
        dictionary: 'dictionary-generation',
        texts: 'text-translation',
        sentences: 'sentence-generation',
        conversation: 'conversation',
        interview: 'portrait-interview',
    }[capability.id];
    return (
        (snapshot.policies?.find((policy) => policy.capability === name)
            ?.funding ??
            (name === 'portrait-interview' ? 'operator' : 'customer')) ===
        'customer'
    );
}
