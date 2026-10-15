import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from './render';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { DuplicatePreview } from '@/fsd/features/text-reading/ui/collect-panel/duplicate-preview';
import { collectionFailureKey } from '@/fsd/features/text-reading/lib/collection-failure';
vi.mock('@/fsd/entities/dictionary', () => ({
    dictionaryApi: { listCards: vi.fn() },
}));
const requestWithSession = async <T,>(request: (token: string) => Promise<T>) =>
    request('owner-token');
describe('duplicate contextual card preview', () => {
    it('matches the normalized exact term in the owner dictionary and shows its translation', async () => {
        vi.mocked(dictionaryApi.listCards).mockResolvedValueOnce({
            data: [
                { values: { source: 'Wordy', translation: 'Wrong' } },
                { values: { source: 'ＷＯＲＤ', translation: 'Слово' } },
            ],
            nextCursor: null,
        } as never);
        render(
            <DuplicatePreview
                dictionaryId='dictionary'
                term='word'
                requestWithSession={requestWithSession}
            />,
        );
        expect(
            await screen.findByText('Existing card: ＷＯＲＤ → Слово'),
        ).toBeInTheDocument();
        expect(dictionaryApi.listCards).toHaveBeenCalledWith(
            'owner-token',
            'dictionary',
            expect.objectContaining({ search: 'word', lifecycle: 'active' }),
            expect.any(AbortSignal),
        );
    });
    it('offers a working preview retry after a failed request', async () => {
        vi.mocked(dictionaryApi.listCards)
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({
                data: [{ values: { source: 'word', translation: 'Слово' } }],
                nextCursor: null,
            } as never);
        render(
            <DuplicatePreview
                dictionaryId='dictionary'
                term='word'
                requestWithSession={requestWithSession}
            />,
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
        await waitFor(() =>
            expect(
                screen.getByText('Existing card: word → Слово'),
            ).toBeInTheDocument(),
        );
    });
    it('maps material terminal failures to distinct localized reasons', () => {
        expect(collectionFailureKey('ai_credits_exhausted')).toBe(
            'texts.collect.credits',
        );
        expect(collectionFailureKey('provider_unavailable')).toBe(
            'texts.collect.unavailable',
        );
        expect(collectionFailureKey('access_revoked')).toBe(
            'texts.collect.revoked',
        );
        expect(collectionFailureKey('stale_content')).toBe(
            'texts.collect.changed',
        );
        expect(collectionFailureKey('generation_proposal_expired')).toBe(
            'texts.collect.expired',
        );
    });
});
