import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { removeDeletedDictionaryCaches } from '@/fsd/features/dictionary-library/lib/dictionary-deletion-cache';

describe('dictionary deletion cache cleanup', () => {
    it('clears every dictionary content family for an all-archived deletion', () => {
        const client = new QueryClient();
        client.setQueryData(['dictionary', 'dictionary-a'], { name: 'A' });
        client.setQueryData(['dictionary-cards', 'dictionary-b'], {
            data: ['card'],
        });
        client.setQueryData(['dictionary-batch-generation-job', 'job-a'], {
            job: { dictionaryId: 'dictionary-a', source: 'old' },
        });
        client.setQueryData(['dictionary-languages'], { languages: ['en'] });

        removeDeletedDictionaryCaches(client, 'all');

        expect(
            client.getQueryData(['dictionary', 'dictionary-a']),
        ).toBeUndefined();
        expect(
            client.getQueryData(['dictionary-cards', 'dictionary-b']),
        ).toBeUndefined();
        expect(
            client.getQueryData(['dictionary-batch-generation-job', 'job-a']),
        ).toBeUndefined();
        expect(client.getQueryData(['dictionary-languages'])).toBeDefined();
    });
});
