import type { Agent } from '@mastra/core/agent';
import type { createContextualTutorTools } from '../modules/conversations/infrastructure/ai/contextual-tutor-tools';
import { createTextsAgents } from '../modules/texts/infrastructure/ai/texts-agents';
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
import {
    createDictionaryCardAuthoringAgent,
    type DictionaryCardAuthoringAgentOptions,
} from '../modules/dictionaries/infrastructure/ai/dictionary-card-authoring-agent';
import { createDictionaryImportPairsGenerationAgent } from '../modules/dictionaries/infrastructure/ai/dictionary-import-pairs-generation-agent';
import {
    createDevelopmentServerMiddleware,
    developmentServerBodySizeLimit,
} from './development-server-policy';

export interface CanonicalMastraOptions {
    /** Admin-bound operator-funded synthetic checks; excluded from default Studio. */
    administrativeProbe?: Agent;
    /** Operation-bound only: Studio deliberately has no learner identity or execution route. */
    learnerInterviewer?: Agent;
    /** Only operation-bound production instances; no default learner identity in Studio. */
    contextualTutor?: {
        agent: Agent;
        tools: ReturnType<typeof createContextualTutorTools>;
    };
    textsAi?: Parameters<typeof createTextsAgents>[0];
    dictionaryCardAuthoring?: DictionaryCardAuthoringAgentOptions;
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
export function createCanonicalMastra(
    options: CanonicalMastraOptions = {},
): Mastra {
    const textsAgents = options.textsAi
        ? createTextsAgents(options.textsAi)
        : undefined;
    const development = options.developmentHarness
        ? createDevelopmentHarnessPrimitives(options.developmentHarness)
        : undefined;
    const dictionaryCardGenerationAgent = options.dictionaryCardGeneration
        ? createDictionaryCardGenerationAgent(options.dictionaryCardGeneration)
        : undefined;
    const dictionaryCardAuthoringAgent = options.dictionaryCardAuthoring
        ? createDictionaryCardAuthoringAgent(options.dictionaryCardAuthoring)
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
        !options.administrativeProbe &&
        !options.contextualTutor &&
        !options.learnerInterviewer &&
        !textsAgents &&
        !dictionaryCardAuthoringAgent &&
        !dictionaryCardGenerationAgent &&
        !dictionaryImportPairsGenerationAgent &&
        !dictionaryPastedTermsGenerationAgent
    ) {
        return new Mastra({ server });
    }

    if (!development) {
        return new Mastra({
            tools: options.contextualTutor?.tools ?? {},
            agents: {
                ...(options.administrativeProbe
                    ? { administrativeProbe: options.administrativeProbe }
                    : {}),
                ...(options.learnerInterviewer
                    ? { learnerInterviewer: options.learnerInterviewer }
                    : {}),
                ...(options.contextualTutor
                    ? { contextualLanguageTutor: options.contextualTutor.agent }
                    : {}),
                ...textsAgents,
                ...(dictionaryCardAuthoringAgent
                    ? { dictionaryCardAuthoringAgent }
                    : {}),
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
        ...(options.learnerInterviewer
            ? { learnerInterviewer: options.learnerInterviewer }
            : {}),
        ...(options.contextualTutor
            ? { contextualTutor: options.contextualTutor }
            : {}),
        development,
        administrativeProbe: options.administrativeProbe,
        textsAgents,
        dictionaryCardAuthoringAgent,
        dictionaryCardGenerationAgent,
        dictionaryImportPairsGenerationAgent,
        dictionaryPastedTermsGenerationAgent,
        server,
    });
}

function createDevelopmentMastra(options: {
    administrativeProbe?: Agent | undefined;
    learnerInterviewer?: Agent;
    contextualTutor?: NonNullable<CanonicalMastraOptions['contextualTutor']>;
    textsAgents: ReturnType<typeof createTextsAgents> | undefined;
    development: ReturnType<typeof createDevelopmentHarnessPrimitives>;
    dictionaryCardGenerationAgent:
        ReturnType<typeof createDictionaryCardGenerationAgent> | undefined;
    dictionaryCardAuthoringAgent:
        ReturnType<typeof createDictionaryCardAuthoringAgent> | undefined;
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
        tools: options.contextualTutor?.tools ?? {},
        agents: {
            ...(options.administrativeProbe
                ? { administrativeProbe: options.administrativeProbe }
                : {}),
            ...(options.learnerInterviewer
                ? { learnerInterviewer: options.learnerInterviewer }
                : {}),
            ...(options.contextualTutor
                ? { contextualLanguageTutor: options.contextualTutor.agent }
                : {}),
            ...options.textsAgents,
            ...(options.dictionaryCardAuthoringAgent
                ? {
                      dictionaryCardAuthoringAgent:
                          options.dictionaryCardAuthoringAgent,
                  }
                : {}),
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
