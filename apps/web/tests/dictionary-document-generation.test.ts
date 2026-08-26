import type { DictionaryDocumentTermsGenerationJob } from '@languon/contracts';

import {
    documentGenerationJobForDictionary,
    documentMediaTypeForFile,
    fileSha256,
} from '@/fsd/features/dictionary-document-generation';

describe('dictionary document generation', () => {
    it('computes the exact lowercase hexadecimal SHA-256 of the selected bytes', async () => {
        await expect(fileSha256(new Blob(['abc']))).resolves.toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
    });

    it('rejects a document job restored under another dictionary URL', () => {
        const job = {
            cancellationRequested: false,
            completedAt: null,
            createdAt: '2026-08-26T10:00:00.000Z',
            dictionaryId: '10000000-0000-4000-8000-000000000001',
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            expiresAt: null,
            failure: null,
            format: 'document-terms:v1',
            id: '20000000-0000-4000-8000-000000000001',
            kind: 'document-terms',
            outcome: null,
            progress: { percent: 0, stage: 'awaiting_upload' },
            proposal: null,
            sourceLanguage: 'en',
            state: 'awaiting-upload',
            targetLanguage: 'es',
            updatedAt: '2026-08-26T10:00:00.000Z',
        } satisfies DictionaryDocumentTermsGenerationJob;

        expect(documentGenerationJobForDictionary(job, job.dictionaryId)).toBe(
            job,
        );
        expect(
            documentGenerationJobForDictionary(
                job,
                '10000000-0000-4000-8000-000000000099',
            ),
        ).toBeNull();
    });

    it('maps accepted file extensions and rejects conflicting declared types', () => {
        expect(documentMediaTypeForFile({ name: 'terms.md', type: '' })).toBe(
            'text/markdown',
        );
        expect(
            documentMediaTypeForFile({
                name: 'terms.docx',
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
        ).toContain('wordprocessingml');
        expect(
            documentMediaTypeForFile({ name: 'terms.pdf', type: 'image/png' }),
        ).toBeNull();
        expect(
            documentMediaTypeForFile({ name: 'terms.csv', type: 'text/csv' }),
        ).toBeNull();
    });
});
