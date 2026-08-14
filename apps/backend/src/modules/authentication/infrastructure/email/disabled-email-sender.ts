import {
    EmailDeliveryUnavailableError,
    type AuthEmailCapability,
    type EmailSender,
    type EmailSendOptions,
    type VerificationCodeEmail,
} from '../../application/ports/email-sender';

export class DisabledEmailSender implements EmailSender {
    public capability(): AuthEmailCapability {
        return { available: false, delivery: 'unavailable' };
    }

    public async sendVerificationCode(
        _message: VerificationCodeEmail,
        options?: EmailSendOptions,
    ): Promise<void> {
        options?.signal?.throwIfAborted();
        throw new EmailDeliveryUnavailableError();
    }
}
