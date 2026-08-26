import { OpenAPIHono } from '@hono/zod-openapi';

import type { AuthHttpPolicy } from './modules/authentication/interface/http/auth-http-policy';
import type { AuthenticationHttpOperations } from './modules/authentication/interface/http/authentication-http-operations';
import type { PasskeyHttpOperations } from './modules/authentication/interface/http/passkey-http-operations';
import { createPasskeyAuthRoutes } from './modules/authentication/interface/http/passkey-auth.routes';
import { createPasswordAuthRoutes } from './modules/authentication/interface/http/password-auth.routes';
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
    operational?: AppOperationalOptions;
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
    if (options?.dictionaries) {
        app.route('/', options.dictionaries);
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
