import type { PrivateDocumentStorage } from '../../../../dictionaries/application/ports/private-document-storage';
import type { AccountPurgeObjectStorage } from '../../../application/ports/account-purge-store';

export class S3AccountPurgeObjectStorage implements AccountPurgeObjectStorage {
    public constructor(private readonly storage: PrivateDocumentStorage) {}

    public async removeAllVersions(objectKey: string, signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        const versions = await this.storage.listVersions({ objectKey, signal });
        for (const version of versions) {
            signal.throwIfAborted();
            if (version.kind === 'tombstone') {
                await this.storage.deleteTombstone({ objectKey, signal, versionId: version.versionId });
            } else {
                await this.storage.deleteVersion({ objectKey, signal, versionId: version.versionId });
            }
        }
        if ((await this.storage.listVersions({ objectKey, signal })).length !== 0) {
            throw new Error('Document object still has physical versions after deletion.');
        }
    }
}
