import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    AccountingRecordRequestSchema,
    AccountingRecordSchema,
    AccountingReportQuerySchema,
    AccountingReportSchema,
    AccountingRefundContextSchema,
    AdminErrorResponseSchema,
} from '@languon/contracts';
import type { AccountingStore } from '../../application/accounting-store';
import {
    AiCreditInsufficientBalanceError,
    AiCreditInvalidAmountError,
    AiCreditIdempotencyConflictError,
} from '../../domain/ai-credit';
import {
    AccountingConflictError,
    AccountingInvalidRecordError,
    AccountingReportPendingError,
} from '../../domain/accounting';
import type { AdministrationService } from '../../../administration/application/administration-service';
import { mapAdministrationHttpError } from '../../../administration/interface/http/administration-http-error-mapping';
import {
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';

export function createAccountingRoutes(options: {
    store: AccountingStore;
    administration: AdministrationService;
    policy: AuthHttpPolicy;
}) {
    const errorResponse = (message: string, code = 'invalid_request') => ({
        error: { code, message, correlationId: randomUUID() },
    });
    const app = new OpenAPIHono({
        defaultHook: (result, c) =>
            result.success
                ? undefined
                : c.json(errorResponse('The request is invalid.'), 400),
    });
    app.use('/admin/ai/accounting/*', async (c, next) => {
        c.header('Cache-Control', 'no-store');
        await next();
    });
    app.onError((error, c) => {
        if (error instanceof AccountingReportPendingError) {
            c.header('Retry-After', '2');
            return c.json(
                errorResponse(
                    'The report is being prepared. Retry shortly.',
                    'service_unavailable',
                ),
                503,
            );
        }
        if (
            error instanceof AccountingConflictError ||
            error instanceof AiCreditIdempotencyConflictError
        )
            return c.json(
                errorResponse(
                    'The record conflicts with existing accounting facts.',
                    'ai_settings_conflict',
                ),
                409,
            );
        if (
            error instanceof AccountingInvalidRecordError ||
            error instanceof AiCreditInvalidAmountError ||
            error instanceof AiCreditInsufficientBalanceError
        )
            return c.json(
                errorResponse('The accounting record is invalid.'),
                400,
            );
        const mapped = mapAdministrationHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    const errors = {
        503: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Report is being prepared; retry after two seconds.',
        },
        400: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Invalid record or period.',
        },
        401: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Authentication required.',
        },
        403: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Administrator authorization required.',
        },
        409: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Conflicting immutable record.',
        },
    };
    const security = [{ bearerAuth: [] }];
    const tags = ['Administration'];
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai/accounting/records',
            tags,
            security,
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: AccountingRecordRequestSchema,
                        },
                    },
                },
            },
            responses: {
                200: {
                    content: {
                        'application/json': { schema: AccountingRecordSchema },
                    },
                    description:
                        'Recorded manual external financial fact. Does not transfer money.',
                },
                ...errors,
            },
        }),
        async (c) => {
            const origin = c.req.header('Origin');
            if (!origin) throw new InvalidRequestOriginError();
            options.policy.assertCookieRequestOrigin(origin);
            const principal =
                await options.administration.authorizeSensitiveOperation(
                    options.policy.parseBearerAuthorization(
                        c.req.header('Authorization') ?? null,
                    ),
                    randomUUID(),
                );
            return c.json(
                await options.store.record(
                    c.req.valid('json'),
                    principal.actor.id,
                    new Date(),
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/accounting/records',
            tags,
            security,
            request: {
                query: z.object({
                    before: z.string().datetime({ offset: true }).optional(),
                    limit: z.coerce.number().int().min(1).max(100).default(50),
                }),
            },
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: z.object({
                                records: z.array(AccountingRecordSchema),
                            }),
                        },
                    },
                    description: 'Recent manual accounting records.',
                },
                ...errors,
            },
        }),
        async (c) => {
            await options.administration.authorizeOperation(
                options.policy.parseBearerAuthorization(
                    c.req.header('Authorization') ?? null,
                ),
                randomUUID(),
            );
            const query = c.req.valid('query');
            return c.json(
                {
                    records: await options.store.list({
                        limit: query.limit,
                        ...(query.before
                            ? { before: new Date(query.before) }
                            : {}),
                    }),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/accounting/report',
            tags,
            security,
            request: { query: AccountingReportQuerySchema },
            responses: {
                200: {
                    content: {
                        'application/json': { schema: AccountingReportSchema },
                    },
                    description:
                        'USD cash and operational usage economics; unknown costs remain explicit.',
                },
                ...errors,
            },
        }),
        async (c) => {
            await options.administration.authorizeOperation(
                options.policy.parseBearerAuthorization(
                    c.req.header('Authorization') ?? null,
                ),
                randomUUID(),
            );
            const query = c.req.valid('query');
            return c.json(
                await options.store.report(
                    new Date(query.from),
                    new Date(query.to),
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/accounting/records/{paymentId}/refund-context',
            tags,
            security,
            request: { params: z.object({ paymentId: z.string().uuid() }) },
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: AccountingRefundContextSchema,
                        },
                    },
                    description:
                        'Current purchase-lot credit attribution; refund writes validate available credits transactionally.',
                },
                ...errors,
            },
        }),
        async (c) => {
            await options.administration.authorizeOperation(
                options.policy.parseBearerAuthorization(
                    c.req.header('Authorization') ?? null,
                ),
                randomUUID(),
            );
            return c.json(
                await options.store.refundContext(
                    c.req.valid('param').paymentId,
                ),
                200,
            );
        },
    );
    return app;
}
