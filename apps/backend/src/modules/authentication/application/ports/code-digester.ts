import type { VerificationChallengePurpose } from '../../domain/verification-challenge';

export interface VerificationCodeBinding {
    code: string;
    flowId: string;
    purpose: VerificationChallengePurpose;
    userId: string;
}

export interface VerificationCodeDigestCandidate extends VerificationCodeBinding {
    digest: string;
}

export interface VerificationCodeDigester {
    digest(binding: VerificationCodeBinding): string;
    matches(candidate: VerificationCodeDigestCandidate): boolean;
}
