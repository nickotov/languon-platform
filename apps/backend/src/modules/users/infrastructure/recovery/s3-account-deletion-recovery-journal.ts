import { randomUUID } from 'node:crypto';

import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

import type { AccountDeletionRecoveryJournal } from '../../application/ports/account-deletion-recovery-journal';
import { encryptJournalEvent } from './account-deletion-journal-codec';

export interface JournalWriterOptions {
    bucket: string;
    client: Pick<S3Client, 'send'>;
    encryptionKey: Buffer;
    namespace: string;
    prefix: string;
}

/** This adapter only constructs PutObject calls; its runtime credential must have no read/delete grant. */
export class S3AccountDeletionRecoveryJournal implements AccountDeletionRecoveryJournal {
    public constructor(private readonly options: JournalWriterOptions) {
        if (!options.bucket || !options.prefix || !options.namespace) throw new Error('Deletion journal destination is required.');
    }

    public async initialize(): Promise<void> {
        const objectKey = `${this.options.prefix}/sentinel`;
        try {
            await this.put(objectKey, { kind: 'sentinel', namespace: this.options.namespace });
        } catch (error) {
            // A concurrent initializer may have already created the immutable sentinel.
            if (!isPreconditionFailure(error)) throw error;
        }
    }

    public async recordBlockingIntent(event: { scheduledAt: Date; userId: string; userVersion: number }): Promise<void> {
        const objectKey = `${this.options.prefix}/events/${randomUUID()}`;
        await this.put(objectKey, {
            kind: 'blocking',
            occurredAt: event.scheduledAt.toISOString(),
            userId: event.userId,
            userVersion: event.userVersion,
        });
    }

    public async recordCancellation(event: { cancelledAt: Date; userId: string; userVersion: number }): Promise<void> {
        const objectKey = `${this.options.prefix}/events/${randomUUID()}`;
        await this.put(objectKey, {
            kind: 'cancellation',
            occurredAt: event.cancelledAt.toISOString(),
            userId: event.userId,
            userVersion: event.userVersion,
        });
    }

    public async recordCommittedDeletion(event: { scheduledAt: Date; userId: string; userVersion: number }): Promise<void> {
        await this.put(`${this.options.prefix}/events/${randomUUID()}`, {
            kind: 'committed',
            occurredAt: event.scheduledAt.toISOString(),
            userId: event.userId,
            userVersion: event.userVersion,
        });
    }

    private async put(objectKey: string, event: Parameters<typeof encryptJournalEvent>[0]): Promise<void> {
        await this.options.client.send(new PutObjectCommand({
            Bucket: this.options.bucket,
            Key: objectKey,
            Body: encryptJournalEvent(event, this.options.encryptionKey, objectKey),
            ContentType: 'application/vnd.languon.deletion-journal+json',
            IfNoneMatch: '*',
            ServerSideEncryption: 'AES256',
        }));
    }
}

function isPreconditionFailure(error: unknown): boolean {
    return typeof error === 'object' && error !== null && '$metadata' in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412;
}
