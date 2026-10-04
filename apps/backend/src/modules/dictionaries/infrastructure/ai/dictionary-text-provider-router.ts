import type { TextAiExecutionSnapshot as DictionaryAiExecutionSnapshot } from '../../../text-ai/application/text-ai-provider-catalog';
import { resolveTextAiExecutionSnapshot } from '../../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import type { CardAuthoringProposalGenerator } from '../../application/ports/card-authoring-proposal-generator';
import type { CardProposalGenerator } from '../../application/ports/card-proposal-generator';
import type { DictionaryGenerationProviderBudgetPolicy } from '../../application/ports/dictionary-generation-provider-policy';
import type { ImportPairsProposalGenerator } from '../../application/ports/import-pairs-proposal-generator';
import type { PastedTermsProposalGenerator } from '../../application/ports/pasted-terms-proposal-generator';
import { createCardAuthoringProposalGenerator } from './card-authoring-proposal-generators';
import { createCardProposalGenerator } from './card-proposal-generators';
import {
    createTextAiMastraGeneratorOptions as createDictionaryTextMastraGeneratorOptions,
    findTextAiModel as findDictionaryTextModel,
} from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';
import { createImportPairsProposalGenerator } from './import-pairs-proposal-generators';
import { createPastedTermsProposalGenerator } from './pasted-terms-proposal-generators';

export interface DictionaryTextProviderSet {
    cardAuthoring: CardAuthoringProposalGenerator;
    card: CardProposalGenerator;
    importPairs: ImportPairsProposalGenerator;
    pastedTerms: PastedTermsProposalGenerator;
}

export type DictionaryTextProviderCredentials = Partial<
    Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>
>;

export interface DictionaryTextProviderRouterOptions {
    credentials: DictionaryTextProviderCredentials;
    factory?: (
        snapshot: DictionaryAiExecutionSnapshot,
        credential: string,
    ) => DictionaryTextProviderSet;
    maximumCachedConfigurations?: number;
}

export class DictionaryTextProviderRouter {
    private readonly cache = new Map<string, DictionaryTextProviderSet>();
    private readonly maximumCachedConfigurations: number;

    public constructor(
        private readonly options: DictionaryTextProviderRouterOptions,
    ) {
        this.maximumCachedConfigurations =
            options.maximumCachedConfigurations ?? 16;
        if (
            !Number.isSafeInteger(this.maximumCachedConfigurations) ||
            this.maximumCachedConfigurations < 1 ||
            this.maximumCachedConfigurations > 64
        )
            throw new Error(
                'Dictionary text provider cache size must be between 1 and 64.',
            );
    }

    public resolve(
        snapshot: DictionaryAiExecutionSnapshot,
        budget: DictionaryGenerationProviderBudgetPolicy,
    ): DictionaryTextProviderSet {
        const catalogModel = resolveTextAiExecutionSnapshot(snapshot, budget);
        const credential =
            this.options.credentials[snapshot.credentialReference];
        if (!credential)
            throw new Error(
                'Dictionary text provider credential is unavailable.',
            );
        const key = stableSnapshotKey(snapshot);
        const cached = this.cache.get(key);
        if (cached) {
            this.cache.delete(key);
            this.cache.set(key, cached);
            return cached;
        }
        const providers = this.options.factory
            ? this.options.factory(snapshot, credential)
            : createProviderSet(catalogModel.id, snapshot, credential);
        this.cache.set(key, providers);
        while (this.cache.size > this.maximumCachedConfigurations) {
            const oldestKey = this.cache.keys().next().value as
                string | undefined;
            if (oldestKey === undefined) break;
            this.cache.delete(oldestKey);
        }
        return providers;
    }

    public get cachedConfigurationCount(): number {
        return this.cache.size;
    }
}

export function createDictionaryTextProviderRoutingAdapters(options: {
    legacy: DictionaryTextProviderSet;
    router: DictionaryTextProviderRouter;
}): DictionaryTextProviderSet {
    const resolve = <T extends keyof DictionaryTextProviderSet>(
        kind: T,
        request: {
            providerBudget: DictionaryGenerationProviderBudgetPolicy;
            providerExecution?: DictionaryAiExecutionSnapshot | null;
        },
    ): DictionaryTextProviderSet[T] =>
        request.providerExecution
            ? options.router.resolve(
                  request.providerExecution,
                  request.providerBudget,
              )[kind]
            : options.legacy[kind];
    return {
        card: {
            generate: (request) => resolve('card', request).generate(request),
            ...(options.legacy.card.readiness
                ? {
                      readiness: options.legacy.card.readiness.bind(
                          options.legacy.card,
                      ),
                  }
                : {}),
        },
        cardAuthoring: {
            generate: (request) =>
                resolve('cardAuthoring', request).generate(request),
            ...(options.legacy.cardAuthoring.readiness
                ? {
                      readiness: options.legacy.cardAuthoring.readiness.bind(
                          options.legacy.cardAuthoring,
                      ),
                  }
                : {}),
        },
        importPairs: {
            generate: (request) =>
                resolve('importPairs', request).generate(request),
            ...(options.legacy.importPairs.readiness
                ? {
                      readiness: options.legacy.importPairs.readiness.bind(
                          options.legacy.importPairs,
                      ),
                  }
                : {}),
        },
        pastedTerms: {
            generate: (request) =>
                resolve('pastedTerms', request).generate(request),
            ...(options.legacy.pastedTerms.readiness
                ? {
                      readiness: options.legacy.pastedTerms.readiness.bind(
                          options.legacy.pastedTerms,
                      ),
                  }
                : {}),
        },
    };
}

function createProviderSet(
    catalogIdentity: string,
    snapshot: DictionaryAiExecutionSnapshot,
    credential: string,
): DictionaryTextProviderSet {
    const model = findDictionaryTextModel(
        `${snapshot.providerId}/${catalogIdentity}`,
    );
    if (!model)
        throw new Error('Dictionary text provider model is unsupported.');
    const shared = createDictionaryTextMastraGeneratorOptions({
        apiKey: credential,
        model,
        providerBudget: snapshot.aggregateBudget,
    });
    return {
        card: createCardProposalGenerator(shared),
        cardAuthoring: createCardAuthoringProposalGenerator(shared),
        importPairs: createImportPairsProposalGenerator(shared),
        pastedTerms: createPastedTermsProposalGenerator(shared),
    };
}

function stableSnapshotKey(snapshot: DictionaryAiExecutionSnapshot): string {
    return JSON.stringify({
        adapterRevision: snapshot.adapterRevision,
        aggregateBudget: snapshot.aggregateBudget,
        credentialReference: snapshot.credentialReference,
        creditPricing: snapshot.creditPricing,
        modelId: snapshot.modelId,
        perCallMaxInputTokens: snapshot.perCallMaxInputTokens,
        perCallMaxOutputTokens: snapshot.perCallMaxOutputTokens,
        providerId: snapshot.providerId,
        supportedFormats: [...snapshot.supportedFormats].sort(),
    });
}
