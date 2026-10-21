import { OpenAPIHono } from '@hono/zod-openapi';

import type { AuthHttpPolicy } from './modules/authentication/interface/http/auth-http-policy';
import type { AuthenticationHttpOperations } from './modules/authentication/interface/http/authentication-http-operations';
import type { PasskeyHttpOperations } from './modules/authentication/interface/http/passkey-http-operations';
import { createPasskeyAuthRoutes } from './modules/authentication/interface/http/passkey-auth.routes';
import { createPasswordAuthRoutes } from './modules/authentication/interface/http/password-auth.routes';
import {
    createUserProfileRoutes,
    type UserProfileRouteDependencies,
} from './modules/users/interface/http/user-profile.routes';
import {
    createAdministrationRoutes,
    type AdministrationRouteDependencies,
} from './modules/administration/interface/http/administration.routes';
import {
    createHealthRoutes,
    type DependencyReadiness,
} from './modules/health/interface/http/health.route';

export interface AppAuthenticationOptions {
    operations: AuthenticationHttpOperations;
    passkeys: PasskeyHttpOperations;
    policy: AuthHttpPolicy;
}

export type AppAdministrationOptions = AdministrationRouteDependencies;

export interface AppOperationalOptions {
    isShuttingDown: () => boolean;
    readiness: () => Promise<DependencyReadiness>;
    releaseSha: string;
}

export function createApp(options?: {
    administration?: AppAdministrationOptions;
    authentication?: AppAuthenticationOptions;
    dictionaries?: OpenAPIHono;
    learning?: OpenAPIHono;
    sentenceLearning?: OpenAPIHono;
    speech?: OpenAPIHono;
    modelPrices?: OpenAPIHono;
    operational?: AppOperationalOptions;
    textAi?: OpenAPIHono;
    texts?: OpenAPIHono;
    conversations?: OpenAPIHono;
    learnerPortraits?: OpenAPIHono;
    knowledge?: OpenAPIHono;
    textsAi?: OpenAPIHono;
    textSelections?: OpenAPIHono;
    userProfiles?: UserProfileRouteDependencies;
}): OpenAPIHono {
    const app = new OpenAPIHono();

    app.route('/', createHealthRoutes(options?.operational));
    if (options?.authentication) {
        app.route(
            '/',
            createPasswordAuthRoutes({
                operations: options.authentication.operations,
                policy: options.authentication.policy,
            }),
        );
        app.route(
            '/',
            createPasskeyAuthRoutes({
                operations: options.authentication.passkeys,
                policy: options.authentication.policy,
            }),
        );
    }
    if (options?.administration) {
        app.route('/', createAdministrationRoutes(options.administration));
    }
    if (options?.conversations) app.route('/', options.conversations);
    if (options?.learnerPortraits) app.route('/', options.learnerPortraits);
    if (options?.knowledge) app.route('/', options.knowledge);
    if (options?.textsAi) app.route('/', options.textsAi);
    if (options?.textSelections) app.route('/', options.textSelections);
    if (options?.texts) app.route('/', options.texts);

    if (options?.dictionaries) {
        app.route('/', options.dictionaries);
    }
    if (options?.sentenceLearning) {
        app.route('/', options.sentenceLearning);
    }
    if (options?.speech) app.route('/', options.speech);
    if (options?.modelPrices) app.route('/', options.modelPrices);
    if (options?.learning) {
        app.route('/', options.learning);
    }
    // Preferences include PUT/OPTIONS beneath /users; mount their route-specific
    // policy before the older profile wildcard preflight handler.
    if (options?.textAi) {
        app.route('/', options.textAi);
    }
    if (options?.userProfiles) {
        app.route('/', createUserProfileRoutes(options.userProfiles));
    }
    app.doc('/openapi.json', {
        info: {
            description: 'Public API for Languon applications.',
            title: 'Languon API',
            version: '0.1.0',
        },
        openapi: '3.1.0',
    });

    return app;
}
