import { Mastra } from '@mastra/core/mastra';

import type { DevelopmentVerificationService } from '../modules/development-harness/application/development-verification-service';
import { createDevelopmentHarnessPrimitives } from '../modules/development-harness/infrastructure/mastra/development-harness-primitives';
import {
    createDictionaryCardGenerationAgent,
    type DictionaryCardGenerationAgentOptions,
} from '../modules/dictionaries/infrastructure/ai/dictionary-card-generation-agent';
import {
    createDictionaryPastedTermsGenerationAgent,
    type DictionaryPastedTermsGenerationAgentOptions,
} from '../modules/dictionaries/infrastructure/ai/dictionary-pasted-terms-generation-agent';
import { createDictionaryImportPairsGenerationAgent } from '../modules/dictionaries/infrastructure/ai/dictionary-import-pairs-generation-agent';
import {
    createDevelopmentServerMiddleware,
    developmentServerBodySizeLimit,
} from './development-server-policy';

export interface CanonicalMastraOptions {
    dictionaryCardGeneration?: DictionaryCardGenerationAgentOptions;
    dictionaryImportPairsGeneration?: Parameters<
        typeof createDictionaryImportPairsGenerationAgent
    >[0];
    dictionaryPastedTermsGeneration?: DictionaryPastedTermsGenerationAgentOptions;
    developmentHarness?: {
        deepSeekApiKey?: string;
        fallbackModelId: `${string}/${string}`;
        modelId: `${string}/${string}`;
        service: DevelopmentVerificationService;
    };
}

export function createCanonicalMastra(
    options: CanonicalMastraOptions & {
        developmentHarness: NonNullable<
            CanonicalMastraOptions['developmentHarness']
        >;
    },
): ReturnType<typeof createDevelopmentMastra>;
export function createCanonicalMastra(options?: CanonicalMastraOptions): Mastra;
export function createCanonicalMastra(options: CanonicalMastraOptions = {}) {
    const development = options.developmentHarness
        ? createDevelopmentHarnessPrimitives(options.developmentHarness)
        : undefined;
    const dictionaryCardGenerationAgent = options.dictionaryCardGeneration
        ? createDictionaryCardGenerationAgent(options.dictionaryCardGeneration)
        : undefined;
    const dictionaryImportPairsGenerationAgent =
        options.dictionaryImportPairsGeneration
            ? createDictionaryImportPairsGenerationAgent(
                  options.dictionaryImportPairsGeneration,
              )
            : undefined;
    const dictionaryPastedTermsGenerationAgent =
        options.dictionaryPastedTermsGeneration
            ? createDictionaryPastedTermsGenerationAgent(
                  options.dictionaryPastedTermsGeneration,
              )
            : undefined;

    const server = {
        apiPrefix: '/api',
        bodySizeLimit: developmentServerBodySizeLimit,
        build: { openAPIDocs: true },
        cors: false as const,
        host: '127.0.0.1',
        ...(development
            ? { middleware: createDevelopmentServerMiddleware() }
            : {}),
        port: 4111,
        studioHost: '127.0.0.1',
        timeout: 30_000,
    };

    if (
        !development &&
        !dictionaryCardGenerationAgent &&
        !dictionaryImportPairsGenerationAgent &&
        !dictionaryPastedTermsGenerationAgent
    ) {
        return new Mastra({ server });
    }

    if (!development) {
        return new Mastra({
            agents: {
                ...(dictionaryCardGenerationAgent
                    ? { dictionaryCardGenerationAgent }
                    : {}),
                ...(dictionaryImportPairsGenerationAgent
                    ? { dictionaryImportPairsGenerationAgent }
                    : {}),
                ...(dictionaryPastedTermsGenerationAgent
                    ? { dictionaryPastedTermsGenerationAgent }
                    : {}),
            },
            logger: false,
            server,
        });
    }

    return createDevelopmentMastra({
        development,
        dictionaryCardGenerationAgent,
        dictionaryImportPairsGenerationAgent,
        dictionaryPastedTermsGenerationAgent,
        server,
    });
}

function createDevelopmentMastra(options: {
    development: ReturnType<typeof createDevelopmentHarnessPrimitives>;
    dictionaryCardGenerationAgent:
        ReturnType<typeof createDictionaryCardGenerationAgent> | undefined;
    dictionaryImportPairsGenerationAgent:
        | ReturnType<typeof createDictionaryImportPairsGenerationAgent>
        | undefined;
    dictionaryPastedTermsGenerationAgent:
        | ReturnType<typeof createDictionaryPastedTermsGenerationAgent>
        | undefined;
    server: {
        apiPrefix: string;
        bodySizeLimit: number;
        build: { openAPIDocs: boolean };
        cors: false;
        host: string;
        middleware?: ReturnType<typeof createDevelopmentServerMiddleware>;
        port: number;
        studioHost: string;
        timeout: number;
    };
}) {
    return new Mastra({
        agents: {
            ...(options.dictionaryCardGenerationAgent
                ? {
                      dictionaryCardGenerationAgent:
                          options.dictionaryCardGenerationAgent,
                  }
                : {}),
            ...(options.dictionaryImportPairsGenerationAgent
                ? {
                      dictionaryImportPairsGenerationAgent:
                          options.dictionaryImportPairsGenerationAgent,
                  }
                : {}),
            ...(options.dictionaryPastedTermsGenerationAgent
                ? {
                      dictionaryPastedTermsGenerationAgent:
                          options.dictionaryPastedTermsGenerationAgent,
                  }
                : {}),
            developmentVerificationAgent: options.development.verificationAgent,
        },
        logger: false,
        scorers: {
            developmentPrincipalMatch: options.development.verificationScorer,
        },
        server: options.server,
        workflows: {
            developmentVerificationWorkflow:
                options.development.verificationWorkflow,
        },
    });
}
