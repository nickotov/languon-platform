import { Mastra } from '@mastra/core/mastra';

import type { DevelopmentVerificationService } from '../modules/development-harness/application/development-verification-service';
import { createDevelopmentHarnessPrimitives } from '../modules/development-harness/infrastructure/mastra/development-harness-primitives';
import {
    createDevelopmentServerMiddleware,
    developmentServerBodySizeLimit,
} from './development-server-policy';

export interface CanonicalMastraOptions {
    developmentHarness?: {
        deepSeekApiKey?: string;
        fallbackModelId: `${string}/${string}`;
        modelId: `${string}/${string}`;
        service: DevelopmentVerificationService;
    };
}

export function createCanonicalMastra(options: CanonicalMastraOptions = {}) {
    const development = options.developmentHarness
        ? createDevelopmentHarnessPrimitives(options.developmentHarness)
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

    if (!development) return new Mastra({ server });

    const mastra = new Mastra({
        agents: {
            developmentVerificationAgent: development.verificationAgent,
        },
        logger: false,
        scorers: {
            developmentPrincipalMatch: development.verificationScorer,
        },
        server,
        workflows: {
            developmentVerificationWorkflow: development.verificationWorkflow,
        },
    });

    return mastra;
}
