import type { VerificationChallengePurpose } from '../../domain/verification-challenge';

export interface AuthEmailCapability {
    available: boolean;
    delivery: 'development' | 'unavailable';
}

export interface VerificationCodeEmail {
    code: string;
    expiresAt: Date;
    flowId: string;
    purpose: VerificationChallengePurpose;
    recipient: string;
}

export interface EmailSendOptions {
    signal?: AbortSignal;
}

export interface EmailSender {
    capability(): AuthEmailCapability;
    sendVerificationCode(
        message: VerificationCodeEmail,
        options?: EmailSendOptions,
    ): Promise<void>;
}

export class EmailDeliveryUnavailableError extends Error {
    public constructor() {
        super('Email delivery is unavailable.');
        this.name = 'EmailDeliveryUnavailableError';
    }
}
