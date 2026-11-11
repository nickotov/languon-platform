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
    const configuration = snapshot.routing?.configuration;
    const flow = capability.formats[0]?.split(':')[0];
    const policy = configuration?.overrides?.[flow] ?? configuration?.default;
    const route = capability.routeId ?? policy?.primaryRouteId;

    return textAiModelCatalog.find(
        (model) => `${model.providerId}/${model.id}` === route,
    );
}

function executionPredicateFor(capability) {
    if (['texts', 'knowledge-actions'].includes(capability.id)) {
        return readiness.isTextsExecutionCapableObservation;
    }

    if (capability.id === 'sentences') {
        return readiness.isSentenceExecutionCapableObservation;
    }

    if (['conversation', 'interview'].includes(capability.id)) {
        return readiness.isConversationExecutionCapableObservation;
    }

    return readiness.isTextAiCapacityCapableObservation;
}

export function workerSupports(worker, model, capability, format) {
    if (
        !model ||
        worker.model_id !== model.id ||
        worker.provider_id !== model.providerId ||
        worker.adapter_revision !== model.adapterRevision ||
        !['available', 'unverified'].includes(worker.status)
    ) {
        return false;
    }

    const observation = Object.fromEntries(
        Object.entries(worker).map(([key, value]) => [
            key.replace(/_([a-z])/g, (_, character) => character.toUpperCase()),
            value,
        ]),
    );
    const predicate = executionPredicateFor(capability);

    return predicate(observation, format);
}

export function customerFunded(snapshot, capability) {
    const name = {
        dictionary: 'dictionary-generation',
        texts: 'text-translation',
        'knowledge-actions': 'text-translation',
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

/** Historical diagnostics are informational and never authorize dispatch. */
export function probeDiagnostic(snapshot, capability, model) {
    const routeId = model ? `${model.providerId}/${model.id}` : null;
    const flowId = capability.formats[0]?.split(':')[0];
    const diagnostic = snapshot.probes?.find(
        (probe) =>
            probe.route_id === routeId &&
            probe.flow_id === flowId &&
            probe.kind === 'flow',
    );

    const scope =
        'Diagnostics are optional and do not determine readiness or current provider connectivity.';

    if (!diagnostic) {
        return `No selected-flow diagnostic recorded. ${scope}`;
    }

    if (diagnostic.state === 'passed') {
        return `Last recorded selected-flow diagnostic passed. ${scope}`;
    }

    if (diagnostic.state === 'failed') {
        return `Last recorded selected-flow diagnostic failed. ${scope}`;
    }

    return `A selected-flow diagnostic is unfinished. ${scope}`;
}
