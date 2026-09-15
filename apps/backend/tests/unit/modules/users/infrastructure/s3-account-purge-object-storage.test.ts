import { describe, expect, it, vi } from 'vitest';

import { S3AccountPurgeObjectStorage } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/s3-account-purge-object-storage';
import type { PrivateDocumentStorage } from '../../../../../src/modules/dictionaries/application/ports/private-document-storage';

describe('S3AccountPurgeObjectStorage', () => {
    it('deletes data and tombstone versions and verifies no physical version remains', async () => {
        const listVersions = vi.fn().mockResolvedValueOnce([
            { kind: 'data', versionId: 'v1' },
            { kind: 'tombstone', versionId: 'v2' },
        ]).mockResolvedValueOnce([]);
        const deleteVersion = vi.fn().mockResolvedValue(undefined);
        const deleteTombstone = vi.fn().mockResolvedValue(undefined);
        const storage = { listVersions, deleteVersion, deleteTombstone } as unknown as PrivateDocumentStorage;
        await new S3AccountPurgeObjectStorage(storage).removeAllVersions('object-1', new AbortController().signal);
        expect(deleteVersion).toHaveBeenCalledWith(expect.objectContaining({ objectKey: 'object-1', versionId: 'v1' }));
        expect(deleteTombstone).toHaveBeenCalledWith(expect.objectContaining({ objectKey: 'object-1', versionId: 'v2' }));
        expect(listVersions).toHaveBeenCalledTimes(2);
    });

    it('refuses completion when a version reappears', async () => {
        const listVersions = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ kind: 'data', versionId: 'late' }]);
        const storage = { listVersions } as unknown as PrivateDocumentStorage;
        await expect(new S3AccountPurgeObjectStorage(storage).removeAllVersions('object-1', new AbortController().signal))
            .rejects.toThrow('still has physical versions');
    });
});
