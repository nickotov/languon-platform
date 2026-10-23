import { defaultDictionaryGenerationProviderBudgetPolicy } from '../../../application/ports/dictionary-generation-provider-policy';
import type { DictionaryGenerationProviderBudgetPolicy } from '../../../application/ports/dictionary-generation-provider-policy';
import type {
    ClaimedDictionaryGenerationJob,
    DictionaryOperationalMeasurement,
    DictionaryGenerationStore,
} from '../../../application/ports/dictionary-generation-store';
import type {
    Database,
    DictionaryGenerationIdGenerator,
    GenerationStoreContext,
} from './generation-context';
export type { DictionaryGenerationIdGenerator } from './generation-context';
export {
    textAiCapacityLock as dictionaryGenerationAdmissionLock,
    textAiProviderBudgetAllows as dictionaryGenerationProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
export type { TextAiProviderBudgetUsage as DictionaryGenerationProviderBudgetUsage } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { enqueue } from './generation-enqueue';
import { enqueueCardAuthoring } from './generation-enqueue-card-authoring';
import { enqueuePastedTerms } from './generation-enqueue-pasted-terms';
import { enqueueDocumentFailureRetry } from './generation-enqueue-pasted-terms';
import { enqueueImportPairs } from './generation-enqueue-import-pairs';
import { enqueueImportPairsRetry } from './generation-enqueue-import-pairs-retry';
import { read } from './generation-job-access';
import { latestForCard } from './generation-job-access';
import { cancel } from './generation-cancellation';
import { discard } from './generation-cancellation';
import { acceptSingleCard } from './generation-accept-single-card';
import { acceptCardAuthoring } from './generation-accept-card-authoring';
import { acceptBatch } from './generation-accept-batch';
import { claim } from './generation-claim';
import { heartbeat } from './generation-worker-leases';
import { markProviderDispatch } from './generation-worker-leases';
import { complete } from './generation-complete';
import { fail } from './generation-fail';
import { releaseWorkerLeases } from './generation-worker-leases';
import { expireReviewPayloads } from './generation-maintenance';
import { readiness } from './generation-maintenance';
import { observeOperationalState } from './generation-maintenance';

export class DrizzleDictionaryGenerationStore implements DictionaryGenerationStore {
    private readonly context: GenerationStoreContext;

    public constructor(
        database: Database,
        ids: DictionaryGenerationIdGenerator,
        providerBudget: DictionaryGenerationProviderBudgetPolicy = defaultDictionaryGenerationProviderBudgetPolicy,
        aiCreditEnforcementEnabled = false,
    ) {
        this.context = {
            database,
            ids,
            providerBudget,
            aiCreditEnforcementEnabled,
        };
    }

    public async enqueue(
        input: Parameters<DictionaryGenerationStore['enqueue']>[0],
    ) {
        return enqueue(this.context, input);
    }

    public async enqueueCardAuthoring(
        input: Parameters<DictionaryGenerationStore['enqueueCardAuthoring']>[0],
    ) {
        return enqueueCardAuthoring(this.context, input);
    }

    public async enqueuePastedTerms(
        input: Parameters<DictionaryGenerationStore['enqueuePastedTerms']>[0],
    ) {
        return enqueuePastedTerms(this.context, input);
    }

    public async enqueueDocumentFailureRetry(
        input: Parameters<
            DictionaryGenerationStore['enqueueDocumentFailureRetry']
        >[0],
    ) {
        return enqueueDocumentFailureRetry(this.context, input);
    }

    public async enqueueImportPairs(
        input: Parameters<DictionaryGenerationStore['enqueueImportPairs']>[0],
    ) {
        return enqueueImportPairs(this.context, input);
    }

    public async enqueueImportPairsRetry(
        input: Parameters<
            DictionaryGenerationStore['enqueueImportPairsRetry']
        >[0],
    ) {
        return enqueueImportPairsRetry(this.context, input);
    }

    public async read(input: Parameters<DictionaryGenerationStore['read']>[0]) {
        return read(this.context, input);
    }

    public async latestForCard(
        input: Parameters<DictionaryGenerationStore['latestForCard']>[0],
    ) {
        return latestForCard(this.context, input);
    }

    public async cancel(
        input: Parameters<DictionaryGenerationStore['cancel']>[0],
    ) {
        return cancel(this.context, input);
    }

    public async discard(
        input: Parameters<DictionaryGenerationStore['discard']>[0],
    ) {
        return discard(this.context, input);
    }

    public async acceptSingleCard(
        input: Parameters<DictionaryGenerationStore['acceptSingleCard']>[0],
    ) {
        return acceptSingleCard(this.context, input);
    }

    public async acceptCardAuthoring(
        input: Parameters<DictionaryGenerationStore['acceptCardAuthoring']>[0],
    ) {
        return acceptCardAuthoring(this.context, input);
    }

    public async acceptBatch(
        input: Parameters<DictionaryGenerationStore['acceptBatch']>[0],
    ) {
        return acceptBatch(this.context, input);
    }

    public async claim(
        input: Parameters<DictionaryGenerationStore['claim']>[0],
    ): Promise<ClaimedDictionaryGenerationJob | null> {
        return claim(this.context, input);
    }

    public async heartbeat(
        input: Parameters<DictionaryGenerationStore['heartbeat']>[0],
    ) {
        return heartbeat(this.context, input);
    }

    public async markProviderDispatch(
        input: Parameters<DictionaryGenerationStore['markProviderDispatch']>[0],
    ) {
        return markProviderDispatch(this.context, input);
    }

    public async complete(
        input: Parameters<DictionaryGenerationStore['complete']>[0],
    ) {
        return complete(this.context, input);
    }

    public async fail(input: Parameters<DictionaryGenerationStore['fail']>[0]) {
        return fail(this.context, input);
    }

    public async releaseWorkerLeases(
        input: Parameters<DictionaryGenerationStore['releaseWorkerLeases']>[0],
    ) {
        return releaseWorkerLeases(this.context, input);
    }

    public async expireReviewPayloads(
        input: Parameters<DictionaryGenerationStore['expireReviewPayloads']>[0],
    ) {
        return expireReviewPayloads(this.context, input);
    }

    public async readiness(signal: AbortSignal) {
        return readiness(this.context, signal);
    }

    public async observeOperationalState(
        input: Parameters<
            DictionaryGenerationStore['observeOperationalState']
        >[0],
    ): Promise<DictionaryOperationalMeasurement> {
        return observeOperationalState(this.context, input);
    }
}
