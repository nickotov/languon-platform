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

export function workerSupports(worker, model, capability, format) {
    if (
        !model ||
        worker.model_id !== model.id ||
        worker.provider_id !== model.providerId ||
        worker.adapter_revision !== model.adapterRevision ||
        !['available', 'unverified'].includes(worker.status)
    )
        return false;
    const observation = Object.fromEntries(
        Object.entries(worker).map(([key, value]) => [
            key.replace(/_([a-z])/g, (_, character) => character.toUpperCase()),
            value,
        ]),
    );
    const predicate = ['texts', 'knowledge-actions'].includes(capability.id)
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

const { createTextAiRouteFingerprint } = await tsImport(
    '../../apps/backend/src/infrastructure/text-ai/route-fingerprint.ts',
    import.meta.url,
);

export function probeEvidence(
    snapshot,
    env,
    capability,
    model,
    now = Date.now(),
) {
    const routeId = model ? `${model.providerId}/${model.id}` : null;
    const flowId = capability.formats[0]?.split(':')[0];
    let fingerprint;
    try {
        fingerprint = createTextAiRouteFingerprint(env)(routeId, flowId);
    } catch {
        return {
            ready: false,
            stale: false,
            reason: 'The current execution identity could not be resolved.',
        };
    }
    const evidence = snapshot.probes?.find(
        (probe) =>
            probe.route_id === routeId &&
            probe.flow_id === flowId &&
            probe.kind === 'flow' &&
            probe.fingerprint === fingerprint,
    );
    // The database function is the same authority used for real dispatch. It
    // retains prior matching successes and provider/route-wide hard failures;
    // elapsed time alone must never create activation evidence.
    if (!evidence) {
        const flowHistory = snapshot.probes?.some(
            (probe) =>
                probe.route_id === routeId &&
                probe.flow_id === flowId &&
                probe.kind === 'flow',
        );
        return {
            ready: false,
            stale: false,
            reason: flowHistory
                ? 'Existing flow checks do not match the current execution identity. Credentials, prompt/schema, adapter or processing-policy changes can invalidate earlier passes.'
                : 'No selected-flow check exists for this route and flow. A quick response or a check for another flow does not activate it.',
        };
    }
    if (evidence.dispatch_allowed !== true)
        return {
            ready: false,
            stale: false,
            reviewCurrent: true,
            reason:
                'Current matching evidence does not permit dispatch. Review the latest check and route-wide failures in Admin → AI routing' +
                (evidence.state === 'failed'
                    ? ' (the last matching check failed).'
                    : evidence.state === 'running'
                      ? ' (the last matching check is still running).'
                      : '.'),
        };
    return {
        ready: true,
        stale:
            !evidence.evidence_expires_at ||
            new Date(evidence.evidence_expires_at).getTime() < now,
    };
}
