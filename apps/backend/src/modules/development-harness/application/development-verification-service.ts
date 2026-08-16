import type { DevelopmentPrincipalReader } from './ports/development-principal-reader';

export type DevelopmentHarnessVariant = 'concise' | 'diagnostic';

export interface VerifyDevelopmentPrincipalInput {
    message: string;
    principalId: string;
    signal?: AbortSignal;
    variant: DevelopmentHarnessVariant;
}

export interface VerifiedDevelopmentPrincipal {
    email: string;
    message: string;
    principalId: string;
    variant: DevelopmentHarnessVariant;
}

export class DevelopmentPrincipalAuthorizationError extends Error {
    public constructor() {
        super('The selected development principal is not authorized.');
        this.name = 'DevelopmentPrincipalAuthorizationError';
    }
}

export class DevelopmentVerificationService {
    public constructor(
        private readonly principals: DevelopmentPrincipalReader,
        private readonly allowedPrincipalId: string,
    ) {}

    public async verifyPrincipal(
        input: VerifyDevelopmentPrincipalInput,
    ): Promise<VerifiedDevelopmentPrincipal> {
        input.signal?.throwIfAborted();

        if (input.principalId !== this.allowedPrincipalId) {
            throw new DevelopmentPrincipalAuthorizationError();
        }

        const principal = await this.principals.findById(input.principalId);
        input.signal?.throwIfAborted();

        if (
            !principal ||
            principal.status !== 'active' ||
            principal.verifiedAt === null
        ) {
            throw new DevelopmentPrincipalAuthorizationError();
        }

        return {
            email: principal.email,
            message: input.message,
            principalId: principal.id,
            variant: input.variant,
        };
    }
}
