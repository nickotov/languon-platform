import { z } from 'zod';
import { BrowserApiError } from '@languon/browser-auth';
import * as c from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

type Detail = z.infer<typeof c.KnowledgeErrorResponseSchema>['error'];
export class WorkbookApiError extends BrowserApiError<Detail> {}
const result = z.object({ workbook: c.WorkbookSchema });
const base = '/knowledge/workbooks';
function path(id: string) {
    return `${base}/${c.WorkbookIdParamsSchema.parse({ workbookId: id }).workbookId}`;
}
async function request<T>(
    route: string,
    schema: { parse(value: unknown): T },
    token?: string,
    method = 'GET',
    body?: unknown,
    shareKey?: string,
    signal?: AbortSignal,
): Promise<T> {
    const fallback: Detail = {
        code: 'internal_error',
        message: 'Workbook unavailable.',
        correlationId: 'workbook-client',
    };
    let response: Response;
    try {
        response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}${route}`,
            {
                method,
                credentials: 'include',
                cache: 'no-store',
                signal: signal ?? AbortSignal.timeout(30_000),
                headers: {
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(shareKey ? { 'X-Languon-Share-Key': shareKey } : {}),
                    ...(body === undefined
                        ? {}
                        : { 'Content-Type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            },
        );
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new WorkbookApiError(0, fallback);
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
        const error = c.KnowledgeErrorResponseSchema.safeParse(payload);
        throw new WorkbookApiError(
            response.status,
            error.success ? error.data.error : fallback,
        );
    }
    try {
        return schema.parse(payload);
    } catch {
        throw new WorkbookApiError(502, fallback);
    }
}
export const workbookApi = {
    list: (token: string, signal?: AbortSignal) =>
        request(
            base,
            z.object({ workbooks: z.array(c.WorkbookSchema) }),
            token,
            'GET',
            undefined,
            undefined,
            signal,
        ),
    get: (token: string, id: string, signal?: AbortSignal) =>
        request(path(id), result, token, 'GET', undefined, undefined, signal),
    create: (token: string, input: c.CreateWorkbookRequest) =>
        request(
            base,
            result,
            token,
            'POST',
            c.CreateWorkbookRequestSchema.parse(input),
        ),
    rename: (token: string, id: string, input: c.UpdateWorkbookRequest) =>
        request(
            path(id),
            result,
            token,
            'PATCH',
            c.UpdateWorkbookRequestSchema.parse(input),
        ),
    setNotes: (token: string, id: string, input: c.SetWorkbookNotesRequest) =>
        request(
            `${path(id)}/notes`,
            result,
            token,
            'PUT',
            c.SetWorkbookNotesRequestSchema.parse(input),
        ),
    remove: (token: string, id: string, version: number) =>
        request(
            path(id),
            z.object({ deleted: z.literal(true) }),
            token,
            'DELETE',
            c.WorkbookVersionSchema.parse({ expectedVersion: version }),
        ),
    share: (token: string, id: string, version: number) =>
        request(
            `${path(id)}/share`,
            c.WorkbookShareSchema,
            token,
            'POST',
            c.WorkbookVersionSchema.parse({ expectedVersion: version }),
        ),
    revoke: (token: string, id: string, version: number) =>
        request(
            `${path(id)}/share`,
            z.object({ disabled: z.literal(true) }),
            token,
            'DELETE',
            c.WorkbookVersionSchema.parse({ expectedVersion: version }),
        ),
    readShared: (locator: string, key: string, signal?: AbortSignal) =>
        request(
            `${base}/shared/${c.WorkbookShareLocatorSchema.parse(locator)}`,
            z.object({ workbook: c.SharedWorkbookSchema }),
            undefined,
            'GET',
            undefined,
            c.WorkbookShareKeySchema.parse(key),
            signal,
        ),
    copy: (
        token: string,
        id: string,
        input: c.CopyWorkbookRequest & { expectedVersion: number },
    ) =>
        request(
            `${path(id)}/copy`,
            result,
            token,
            'POST',
            c.CopyWorkbookRequestSchema.extend(
                c.WorkbookVersionSchema.shape,
            ).parse(input),
        ),
    copyShared: (
        token: string,
        locator: string,
        key: string,
        input: c.CopyWorkbookRequest,
    ) =>
        request(
            `${base}/shared/${c.WorkbookShareLocatorSchema.parse(locator)}/copy`,
            result,
            token,
            'POST',
            c.CopyWorkbookRequestSchema.parse(input),
            c.WorkbookShareKeySchema.parse(key),
        ),
};
