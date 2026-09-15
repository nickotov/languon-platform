import {
    GetObjectCommand,
    ListObjectVersionsCommand,
    type S3Client,
} from '@aws-sdk/client-s3';

import {
    decryptJournalEvent,
    type JournalEvent,
} from './account-deletion-journal-codec';

export interface JournalReadOptions {
    bucket: string;
    client: Pick<S3Client, 'send'>;
    encryptionKey: Buffer;
    namespace: string;
    prefix: string;
}

/** Only the offline restore role should be given ListBucket/GetObject authority. */
export class S3AccountDeletionRecoveryReader {
    public constructor(private readonly options: JournalReadOptions) {}

    public async readAll(): Promise<JournalEvent[]> {
        const sentinel = await this.read(`${this.options.prefix}/sentinel`);
        if (
            sentinel.kind !== 'sentinel' ||
            sentinel.namespace !== this.options.namespace
        ) {
            throw new Error(
                'Deletion journal sentinel is unavailable or invalid.',
            );
        }
        const events: JournalEvent[] = [];
        let keyMarker: string | undefined;
        let versionIdMarker: string | undefined;
        const seenMarkers = new Set<string>();
        const seenKeys = new Set<string>();
        do {
            const page = await this.options.client.send(
                new ListObjectVersionsCommand({
                    Bucket: this.options.bucket,
                    Prefix: `${this.options.prefix}/events/`,
                    KeyMarker: keyMarker,
                    VersionIdMarker: versionIdMarker,
                }),
            );
            if (page.IsTruncated && !page.NextKeyMarker)
                throw new Error('Deletion journal listing is incomplete.');
            if (page.DeleteMarkers?.length)
                throw new Error('Deletion journal contains a delete marker.');
            for (const object of page.Versions ?? []) {
                if (
                    !object.Key ||
                    !/^events\/[0-9a-f-]{36}$/.test(
                        object.Key.slice(this.options.prefix.length + 1),
                    )
                ) {
                    throw new Error(
                        'Deletion journal contains an invalid object key.',
                    );
                }
                if (!object.VersionId || seenKeys.has(object.Key))
                    throw new Error(
                        'Deletion journal contains ambiguous object versions.',
                    );
                seenKeys.add(object.Key);
                const event = await this.read(object.Key, object.VersionId);
                if (event.kind === 'sentinel')
                    throw new Error(
                        'Deletion journal contains an unexpected sentinel.',
                    );
                events.push(event);
            }
            keyMarker = page.NextKeyMarker;
            versionIdMarker = page.NextVersionIdMarker;
            if (keyMarker) {
                const marker = `${keyMarker}:${versionIdMarker ?? ''}`;
                if (seenMarkers.has(marker))
                    throw new Error(
                        'Deletion journal listing repeated a page.',
                    );
                seenMarkers.add(marker);
            }
        } while (keyMarker);
        return events;
    }

    private async read(
        objectKey: string,
        versionId?: string,
    ): Promise<JournalEvent> {
        const result = await this.options.client.send(
            new GetObjectCommand({
                Bucket: this.options.bucket,
                Key: objectKey,
                ...(versionId ? { VersionId: versionId } : {}),
            }),
        );
        if (!result.Body)
            throw new Error('Deletion journal object has no body.');
        const body = await result.Body.transformToByteArray();
        return decryptJournalEvent(body, this.options.encryptionKey, objectKey);
    }
}
