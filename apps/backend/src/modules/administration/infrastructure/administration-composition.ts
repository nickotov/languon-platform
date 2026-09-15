import type { AppAdministrationOptions } from '../../../app';
import type { Environment } from '../../../config/environment';
import type { AuthenticationComposition } from '../../authentication/infrastructure/authentication-composition';
import { AuthHttpPolicy } from '../../authentication/interface/http/auth-http-policy';
import { AdministrationService } from '../application/administration-service';
import { DrizzleAdministrationStore } from './persistence/drizzle/drizzle-administration-store';
import type { AccountDeletionRecoveryJournal } from '../../users/application/ports/account-deletion-recovery-journal';

export function createAdministrationComposition(
    environment: Environment,
    authentication: AuthenticationComposition,
    deletionJournal: AccountDeletionRecoveryJournal,
): AppAdministrationOptions {
    const dependencies = authentication.administrationDependencies;
    return {
        administration: new AdministrationService({
            accessTokens: dependencies.accessTokens,
            authentication: dependencies.authentication,
            clock: dependencies.clock,
            ids: dependencies.ids,
            store: new DrizzleAdministrationStore(dependencies.database, deletionJournal),
        }),
        authentication: authentication.options.operations,
        passkeys: authentication.options.passkeys,
        policy: new AuthHttpPolicy({
            allowedOrigins: [environment.ADMIN_BASE_URL],
            appEnvironment: environment.APP_ENV,
            refreshCookieNamespace: 'admin',
            refreshTokenTtlSeconds: environment.AUTH_REFRESH_TOKEN_TTL,
            trustProxy: environment.AUTH_TRUST_PROXY,
            trustedProxyCidrs: environment.AUTH_TRUSTED_PROXY_CIDRS,
        }),
    };
}
