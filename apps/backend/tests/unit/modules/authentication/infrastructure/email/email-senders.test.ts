import { describe, expect, it } from 'vitest';

import { EmailDeliveryUnavailableError } from '../../../../../../src/modules/authentication/application/ports/email-sender';
import { DevelopmentEmailSender } from '../../../../../../src/modules/authentication/infrastructure/email/development-email-sender';
import { DisabledEmailSender } from '../../../../../../src/modules/authentication/infrastructure/email/disabled-email-sender';

const message = {
    code: '0000',
    expiresAt: new Date('2026-08-13T10:10:00.000Z'),
    flowId: '0198a941-7824-7de6-8200-e54baa45a926',
    purpose: 'email_verification' as const,
    recipient: 'private@example.com',
};

describe('authentication email adapters', () => {
    it('reports development capability and accepts only the fixed code', async () => {
        const sender = new DevelopmentEmailSender();

        expect(sender.capability()).toEqual({
            available: true,
            delivery: 'development',
        });
        await expect(
            sender.sendVerificationCode(message),
        ).resolves.toBeUndefined();

        const error = await sender
            .sendVerificationCode({ ...message, code: '1234' })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(Error);
        expect(String(error)).not.toContain('1234');
        expect(String(error)).not.toContain(message.recipient);
    });

    it('reports unavailable and rejects before claiming delivery', async () => {
        const sender = new DisabledEmailSender();

        expect(sender.capability()).toEqual({
            available: false,
            delivery: 'unavailable',
        });
        await expect(
            sender.sendVerificationCode(message),
        ).rejects.toBeInstanceOf(EmailDeliveryUnavailableError);
    });

    it('honors cancellation without leaking message contents', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
            new DevelopmentEmailSender().sendVerificationCode(message, {
                signal: controller.signal,
            }),
        ).rejects.not.toThrowError(message.recipient);
    });
});
