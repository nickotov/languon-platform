import { describe, expect, it, vi } from 'vitest';
import { AdminErrorResponseSchema } from '@languon/contracts';
import { AccountingReportPendingError } from '../../../../../src/modules/ai-credits/domain/accounting';
import { createAccountingRoutes } from '../../../../../src/modules/ai-credits/interface/http/accounting.routes';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';

describe('admin accounting boundaries', () => {
    function setup() {
        const record = vi
            .fn()
            .mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
        const report = vi.fn();
        const authorizeOperation = vi
            .fn()
            .mockRejectedValue(new Error('Not authorized'));
        const authorizeSensitiveOperation = vi.fn().mockResolvedValue({
            actor: { id: '11111111-1111-4111-8111-111111111111' },
        });
        const app = createAccountingRoutes({
            store: { record, report } as unknown as Parameters<
                typeof createAccountingRoutes
            >[0]['store'],
            administration: {
                authorizeOperation,
                authorizeSensitiveOperation,
            } as unknown as Parameters<
                typeof createAccountingRoutes
            >[0]['administration'],
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3001'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        return {
            app,
            record,
            report,
            authorizeSensitiveOperation,
            authorizeOperation,
        };
    }
    const payment = {
        kind: 'provider_deposit',
        providerId: 'test',
        amountUsd: '12.003001',
        occurredAt: '2026-10-01T00:00:00Z',
        reference: 'external-receipt',
        reason: 'Confirmed external receipt',
        source: 'manual',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
    };
    it('checks trusted origin before recording money facts', async () => {
        const { app, record, authorizeSensitiveOperation } = setup();
        const response = await app.request('/admin/ai/accounting/records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer fake.local.token',
                Origin: 'https://untrusted.example',
            },
            body: JSON.stringify(payment),
        });
        expect(response.status).toBe(403);
        expect(authorizeSensitiveOperation).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
    });
    it('uses recent owner authorization and authenticated actor for writes', async () => {
        const { app, record, authorizeSensitiveOperation } = setup();
        const response = await app.request('/admin/ai/accounting/records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer fake.local.token',
                Origin: 'http://localhost:3001',
            },
            body: JSON.stringify(payment),
        });
        expect(response.status).toBe(200);
        expect(authorizeSensitiveOperation).toHaveBeenCalledOnce();
        expect(record).toHaveBeenCalledWith(
            payment,
            '11111111-1111-4111-8111-111111111111',
            expect.any(Date),
        );
    });
    it('returns a valid explicit retryable response while durable reports are pending', async () => {
        const { app, report, authorizeOperation } = setup();
        authorizeOperation.mockResolvedValue(undefined);
        report.mockRejectedValue(new AccountingReportPendingError());
        const response = await app.request(
            '/admin/ai/accounting/report?from=2026-10-01T00%3A00%3A00Z&to=2026-10-02T00%3A00%3A00Z',
            { headers: { Authorization: 'Bearer fake.local.token' } },
        );
        expect(response.status).toBe(503);
        expect(response.headers.get('Retry-After')).toBe('2');
        expect(
            AdminErrorResponseSchema.parse(await response.json()).error.code,
        ).toBe('service_unavailable');
    });
    it('never queries USD reports when authorization fails', async () => {
        const { app, report } = setup();
        await app.request(
            '/admin/ai/accounting/report?from=2026-10-01T00%3A00%3A00Z&to=2026-10-02T00%3A00%3A00Z',
            { headers: { Authorization: 'Bearer fake.local.token' } },
        );
        expect(report).not.toHaveBeenCalled();
    });
});
