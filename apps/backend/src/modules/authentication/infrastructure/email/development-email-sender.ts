import type {
    AuthEmailCapability,
    EmailSender,
    EmailSendOptions,
    VerificationCodeEmail,
} from '../../application/ports/email-sender';

const fixedDevelopmentCode = '0000';

export class DevelopmentEmailSender implements EmailSender {
    public capability(): AuthEmailCapability {
        return { available: true, delivery: 'development' };
    }

    public async sendVerificationCode(
        message: VerificationCodeEmail,
        options?: EmailSendOptions,
    ): Promise<void> {
        options?.signal?.throwIfAborted();

        if (message.code !== fixedDevelopmentCode) {
            throw new Error(
                'The development email adapter accepts only the fixed development code.',
            );
        }

        await Promise.resolve();
    }
}
