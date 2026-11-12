import { z } from 'zod';

export interface TutorPlaygroundPolicy {
    toolInputs: Readonly<Record<string, z.ZodType>>;
    requestContextSchema: z.ZodType;
    workflowInputSchema: z.ZodType;
}

const workflowIds = ['run-tutor-turn', 'runTutorTurn'];
const emptyBody = z.object({}).strict();

/** Execution permissions come only from the primitives composed by this process. */
export function tutorPlaygroundRoute(
    pathname: string,
    policy: TutorPlaygroundPolicy | undefined,
): { schema: z.ZodType; executes: boolean } | undefined {
    if (!policy) {
        return;
    }

    for (const [id, schema] of Object.entries(policy.toolInputs)) {
        if (pathname === `/api/tools/${id}/execute`) {
            return {
                executes: true,
                schema: z
                    .object({
                        data: schema,
                        requestContext: policy.requestContextSchema.optional(),
                    })
                    .strict(),
            };
        }
    }

    for (const id of workflowIds) {
        const prefix = `/api/workflows/${id}/`;
        if (!pathname.startsWith(prefix)) {
            continue;
        }

        const suffix = pathname.slice(prefix.length);
        if (
            suffix === 'create-run' ||
            /^runs\/[A-Za-z0-9_-]{1,128}\/cancel$/.test(suffix)
        ) {
            return { executes: false, schema: emptyBody };
        }

        if (suffix === 'start' || suffix === 'stream') {
            return {
                executes: true,
                schema: z
                    .object({
                        inputData: policy.workflowInputSchema,
                        requestContext: policy.requestContextSchema.optional(),
                        closeOnSuspend: z.boolean().optional(),
                        perStep: z.literal(false).optional(),
                    })
                    .strict(),
            };
        }
    }
}

/** Studio's optional UUID form emits an empty string when no session is selected. */
export async function normalizeTutorPlaygroundRequest(
    request: Request,
): Promise<Request> {
    const text = await request.clone().text();
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        return request;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return request;
    }

    const input = (body as Record<string, unknown>).inputData;
    if (
        input &&
        typeof input === 'object' &&
        !Array.isArray(input) &&
        (input as Record<string, unknown>).sessionId === ''
    ) {
        delete (input as Record<string, unknown>).sessionId;

        return new Request(request, { body: JSON.stringify(body) });
    }

    return request;
}

export async function validateTutorPlaygroundBody(
    request: Request,
    schema: z.ZodType,
    maximumBytes: number,
): Promise<{ status: 400 | 413; message: string } | undefined> {
    const text = await request.clone().text();
    if (new TextEncoder().encode(text).byteLength > maximumBytes) {
        return {
            status: 413,
            message: 'The playground request body is too large.',
        };
    }

    try {
        const parsed: unknown = text ? JSON.parse(text) : {};
        if (!schema.safeParse(parsed).success) {
            return {
                status: 400,
                message:
                    'The playground request does not match the registered primitive input.',
            };
        }
    } catch {
        return {
            status: 400,
            message: 'The playground request body must be valid JSON.',
        };
    }
}
