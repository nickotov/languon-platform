import { afterEach, describe, expect, it, vi } from 'vitest';
import { workbookApi, WorkbookApiError } from '@/fsd/features/workbooks';

const id = '11111111-1111-4111-8111-111111111111';
const noteId = '22222222-2222-4222-8222-222222222222';
const locator = 'a'.repeat(32);
const key = 'b'.repeat(43);
const workbook = {
    id,
    title: 'Workbook',
    version: 1,
    shared: false,
    notes: [],
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
};
function mockResponse(payload: unknown, status = 200) {
    const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
}
afterEach(() => vi.unstubAllGlobals());
describe('workbook API boundaries', () => {
    it('sends versioned ordered membership and explicit sharing acknowledgement', async () => {
        const fetch = mockResponse({ workbook });
        await workbookApi.setNotes('session', id, {
            expectedVersion: 1,
            noteIds: [noteId],
            acknowledgeSharedAddition: true,
        });
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).toContain(`/knowledge/workbooks/${id}/notes`);
        expect(options.method).toBe('PUT');
        expect(options.headers.Authorization).toBe('Bearer session');
        expect(JSON.parse(options.body)).toEqual({
            expectedVersion: 1,
            noteIds: [noteId],
            acknowledgeSharedAddition: true,
        });
    });
    it('keeps public access secrets out of URLs and sends no bearer identity', async () => {
        const { shared: _shared, ...publicWorkbook } = workbook;
        const fetch = mockResponse({ workbook: publicWorkbook });
        await workbookApi.readShared(locator, key);
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).toContain(`/shared/${locator}`);
        expect(url).not.toContain(key);
        expect(options.headers['X-Languon-Share-Key']).toBe(key);
        expect(options.headers.Authorization).toBeUndefined();
        expect(options.cache).toBe('no-store');
    });
    it('rejects malformed shared locators before making a request', async () => {
        const fetch = mockResponse({ workbook });
        expect(() => workbookApi.readShared('../private', key)).toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });
    it('sends one stable copy identity with authenticated source access', async () => {
        const fetch = mockResponse({ workbook });
        await workbookApi.copyShared('session', locator, key, {
            id,
            title: 'Copy',
        });
        const [, options] = fetch.mock.calls[0]!;
        expect(options.headers.Authorization).toBe('Bearer session');
        expect(options.headers['X-Languon-Share-Key']).toBe(key);
        expect(JSON.parse(options.body)).toEqual({ id, title: 'Copy' });
    });
    it('copies an owner workbook with a fixed source version and fresh identity', async () => {
        const fetch = mockResponse({ workbook });
        await workbookApi.copy('session', id, {
            id: noteId,
            title: 'Copy',
            expectedVersion: 1,
        });
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).toContain(`/knowledge/workbooks/${id}/copy`);
        expect(JSON.parse(options.body)).toEqual({
            id: noteId,
            title: 'Copy',
            expectedVersion: 1,
        });
    });
    it('rejects malformed successful payloads instead of rendering unchecked content', async () => {
        mockResponse({ workbooks: [{ id, title: '<script>x</script>' }] });
        await expect(workbookApi.list('session')).rejects.toBeInstanceOf(
            WorkbookApiError,
        );
    });
    it('preserves conflict status for reload and does not retry a write', async () => {
        const fetch = mockResponse(
            {
                error: {
                    code: 'version_conflict',
                    message: 'Changed.',
                    correlationId: 'test',
                },
            },
            409,
        );
        await expect(
            workbookApi.rename('session', id, {
                expectedVersion: 1,
                title: 'New',
            }),
        ).rejects.toMatchObject({ status: 409 });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
