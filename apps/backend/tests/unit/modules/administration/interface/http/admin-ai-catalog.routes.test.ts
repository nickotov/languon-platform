import { describe, expect, it, vi } from 'vitest';
import type { AdminAiCatalogEntry } from '@languon/contracts';

import type { AdministrationService } from '../../../../../../src/modules/administration/application/administration-service';
import { AdminAccessDeniedError } from '../../../../../../src/modules/administration/application/administration-errors';
import { createAdministrationRoutes } from '../../../../../../src/modules/administration/interface/http/administration.routes';
import { AuthHttpPolicy } from '../../../../../../src/modules/authentication/interface/http/auth-http-policy';
import type { AuthenticationHttpOperations } from '../../../../../../src/modules/authentication/interface/http/authentication-http-operations';
import type { PasskeyHttpOperations } from '../../../../../../src/modules/authentication/interface/http/passkey-http-operations';

const token = 'header.payload.signature';
const entry: AdminAiCatalogEntry = {
    kind: 'prompt',
    id: 'example-prompt',
    name: 'Example prompt',
    description: 'Checked-in prompt definition.',
    module: 'example',
    scope: 'application',
    references: [],
    content:
        'Exact static template: <script>literal</script> {{requestContext}}',
    sourcePath: 'packages/prompts/src/local/example.ts',
    limitations: ['Request context is not included.'],
};
const summary = {
    kind: entry.kind,
    id: entry.id,
    name: entry.name,
    description: entry.description,
    module: entry.module,
    scope: entry.scope,
    references: entry.references,
};

function setup() {
    const authorizeOperation = vi.fn().mockResolvedValue({
        actor: { id: 'owner', role: 'owner' },
        sessionId: 'session',
    });
    const list = vi.fn(() => [summary]);
    const detail = vi.fn(() => entry as AdminAiCatalogEntry | undefined);
    const app = createAdministrationRoutes({
        administration: {
            authorizeOperation,
        } as unknown as AdministrationService,
        authentication: {} as AuthenticationHttpOperations,
        passkeys: {} as PasskeyHttpOperations,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3001'],
            appEnvironment: 'development',
            refreshCookieNamespace: 'admin',
            refreshTokenTtlSeconds: 86400,
        }),
        aiCatalog: { list, detail },
    });
    const get = (path = '/admin/ai-catalog') =>
        app.request(path, { headers: { Authorization: `Bearer ${token}` } });

    return { app, get, authorizeOperation, list, detail };
}

describe('read-only admin AI catalog HTTP boundary', () => {
    it('publishes only GET catalog operations in the generated OpenAPI document', async () => {
        const fixture = setup();
        fixture.app.doc('/openapi.json', {
            openapi: '3.1.0',
            info: { title: 'Catalog test', version: '1' },
        });

        const response = await fixture.app.request('/openapi.json');

        expect(response.status).toBe(200);
        const document = await response.json();

        expect(Object.keys(document.paths['/admin/ai-catalog'])).toEqual([
            'get',
        ]);

        expect(
            Object.keys(document.paths['/admin/ai-catalog/{kind}/{id}']),
        ).toEqual(['get']);

        expect(fixture.list).not.toHaveBeenCalled();
        expect(fixture.detail).not.toHaveBeenCalled();
    });

    it('requires a valid bearer token before reading any definition', async () => {
        const fixture = setup();
        const response = await fixture.app.request('/admin/ai-catalog');

        expect(response.status).toBe(401);
        expect(fixture.list).not.toHaveBeenCalled();
        expect(fixture.authorizeOperation).not.toHaveBeenCalled();
    });

    it('checks active owner authorization before list and detail access', async () => {
        const fixture = setup();
        fixture.authorizeOperation.mockRejectedValue(
            new AdminAccessDeniedError(),
        );

        expect((await fixture.get()).status).toBe(403);
        expect(
            (await fixture.get('/admin/ai-catalog/prompt/example-prompt'))
                .status,
        ).toBe(403);

        expect(fixture.authorizeOperation).toHaveBeenCalledWith(
            token,
            expect.any(String),
        );

        expect(fixture.list).not.toHaveBeenCalled();
        expect(fixture.detail).not.toHaveBeenCalled();
    });

    it('rejects foreign origins and does not expose a public catalog alias', async () => {
        const fixture = setup();
        const foreignResponse = await fixture.app.request('/admin/ai-catalog', {
            headers: {
                Authorization: `Bearer ${token}`,
                Origin: 'https://untrusted.example',
            },
        });

        expect(foreignResponse.status).toBe(403);
        expect((await fixture.get('/ai-catalog')).status).toBe(404);
        expect(fixture.list).not.toHaveBeenCalled();
        expect(fixture.authorizeOperation).not.toHaveBeenCalled();
    });

    it('returns only validated summaries and rechecks authorization on every request', async () => {
        const fixture = setup();
        const response = await fixture.get();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ entries: [summary] });
        expect(response.headers.get('Cache-Control')).toBe('no-store');

        fixture.authorizeOperation.mockRejectedValueOnce(
            new AdminAccessDeniedError(),
        );

        expect((await fixture.get()).status).toBe(403);
        expect(fixture.authorizeOperation).toHaveBeenCalledTimes(2);
        expect(fixture.list).toHaveBeenCalledTimes(1);
    });

    it('returns exact static content with private caching disabled', async () => {
        const fixture = setup();
        const response = await fixture.get(
            '/admin/ai-catalog/prompt/example-prompt',
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ entry });
        expect(fixture.detail).toHaveBeenCalledWith('prompt', 'example-prompt');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('rejects unsupported kinds and malformed identities without reading definitions', async () => {
        const fixture = setup();

        expect(
            (await fixture.get('/admin/ai-catalog/workflow/example')).status,
        ).toBe(400);

        expect(
            (await fixture.get('/admin/ai-catalog/tool/%3Cscript%3E')).status,
        ).toBe(400);

        expect(fixture.detail).not.toHaveBeenCalled();
    });

    it('returns a stable not-found error for an unknown entry', async () => {
        const fixture = setup();
        fixture.detail.mockReturnValueOnce(undefined);
        const response = await fixture.get('/admin/ai-catalog/tool/unknown');

        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({
            error: { code: 'ai_catalog_entry_not_found' },
        });
    });

    it('does not serialize malformed metadata or expose its validation diagnostics', async () => {
        const fixture = setup();
        fixture.list.mockReturnValueOnce([
            { ...summary, secret: 'unexpected-private-field' },
        ] as never);

        const response = await fixture.get();

        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('unexpected-private-field');
    });

    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
        'does not expose a %s mutation or execution surface',
        async (method) => {
            const fixture = setup();
            const response = await fixture.app.request(
                '/admin/ai-catalog/tool/example',
                {
                    method,
                    headers: { Authorization: `Bearer ${token}` },
                },
            );

            expect(response.status).toBe(404);
            expect(fixture.list).not.toHaveBeenCalled();
            expect(fixture.detail).not.toHaveBeenCalled();
        },
    );
});
