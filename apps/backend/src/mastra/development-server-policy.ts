import type { Middleware } from '@mastra/core/server';

import { developmentHarnessMaximumAgentSteps } from '../modules/development-harness/infrastructure/mastra/development-harness-limits';

const agentPath = '/api/agents/development-verification-agent';
const allowedHosts = new Set(['127.0.0.1:4111', 'localhost:4111']);
const forbiddenRequestKeys = new Set([
    'activeTools',
    'clientTools',
    'defaultOptions',
    'instructions',
    'model',
    'modelId',
    'modelSettings',
    'output',
    'provider',
    'providerOptions',
    'scorers',
    'stopWhen',
    'structuredOutput',
    'system',
    'toolChoice',
    'tools',
    'toolsets',
    'versions',
]);

export const developmentServerBodySizeLimit = 32 * 1_024;
export const developmentServerMaximumAgentSteps =
    developmentHarnessMaximumAgentSteps;

interface PolicyFailure {
    message: string;
    status: 400 | 403 | 413 | 429;
}

export function createDevelopmentServerMiddleware(): Middleware[] {
    let activeAgentExecutions = 0;

    return [
        {
            path: '*',
            handler: async (context, next) => {
                const originFailure = validateLocalRequestAuthority(
                    context.req.raw,
                );
                if (originFailure) {
                    return context.json(
                        { error: originFailure.message },
                        originFailure.status,
                    );
                }

                await next();
            },
        },
        {
            path: '/api/*',
            handler: async (context, next) => {
                const pathname = new URL(context.req.url).pathname;
                if (isUnsupportedProxyPath(pathname)) {
                    return context.json(
                        {
                            error: 'The development harness does not expose generic model proxy APIs.',
                        },
                        403,
                    );
                }
                if (
                    isStateChangingMethod(context.req.method) &&
                    !isAllowedMutation(context.req.method, pathname)
                ) {
                    return context.json(
                        {
                            error: 'The development harness API permits mutations only for its registered verification primitives.',
                        },
                        403,
                    );
                }

                await next();
            },
        },
        {
            path: `${agentPath}/*`,
            handler: async (context, next) => {
                if (!hasRequestBody(context.req.method)) {
                    await next();
                    return;
                }

                const requestFailure = await validateAgentRequestBody(
                    context.req.raw,
                );
                if (requestFailure) {
                    return context.json(
                        { error: requestFailure.message },
                        requestFailure.status,
                    );
                }

                const pathname = new URL(context.req.url).pathname;
                if (!isAgentModelExecutionPath(pathname)) {
                    await next();
                    return;
                }

                if (activeAgentExecutions >= 1) {
                    return context.json(
                        {
                            error: 'Only one development agent execution may run at a time.',
                        },
                        429,
                    );
                }

                activeAgentExecutions += 1;
                let responseOwnsLease = false;
                try {
                    await next();
                    const response = context.res;
                    if (!response.body) return;

                    responseOwnsLease = true;
                    context.res = withCompletionLease(response, () => {
                        activeAgentExecutions -= 1;
                    });
                } finally {
                    if (!responseOwnsLease) activeAgentExecutions -= 1;
                }
            },
        },
    ];
}

export function enforceDevelopmentHarnessProcessPolicy(
    environment: NodeJS.ProcessEnv = process.env,
): void {
    environment.MASTRA_TELEMETRY_DISABLED = 'true';
}

export function validateLocalRequestAuthority(
    request: Request,
): PolicyFailure | undefined {
    const host = request.headers.get('host');
    if (!host || !allowedHosts.has(host.toLowerCase())) {
        return {
            message:
                'The development harness API accepts only its documented loopback host.',
            status: 403,
        };
    }

    const origin = request.headers.get('origin');
    if (!origin) return;

    try {
        const parsed = new URL(origin);
        if (parsed.protocol === 'http:' && allowedHosts.has(parsed.host)) {
            return;
        }
    } catch {
        // The failure below intentionally handles malformed origins as untrusted.
    }

    return {
        message:
            'The development harness API accepts only its documented loopback origins.',
        status: 403,
    };
}

export async function validateAgentRequestBody(
    request: Request,
): Promise<PolicyFailure | undefined> {
    const text = await request.clone().text();
    if (
        new TextEncoder().encode(text).byteLength >
        developmentServerBodySizeLimit
    ) {
        return {
            message: 'The development agent request body is too large.',
            status: 413,
        };
    }
    if (!text) return;

    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        return {
            message: 'The development agent request body must be valid JSON.',
            status: 400,
        };
    }

    const forbiddenKey = findForbiddenKey(body);
    if (forbiddenKey) {
        return {
            message: `The development agent request cannot override ${forbiddenKey}.`,
            status: 403,
        };
    }

    const maxSteps = readMaximumSteps(body);
    if (
        maxSteps !== undefined &&
        (!Number.isInteger(maxSteps) ||
            maxSteps < 1 ||
            maxSteps > developmentServerMaximumAgentSteps)
    ) {
        return {
            message: `The development agent maxSteps value must be an integer from 1 through ${developmentServerMaximumAgentSteps}.`,
            status: 400,
        };
    }
}

function findForbiddenKey(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        for (const entry of value) {
            const result = findForbiddenKey(entry);
            if (result) return result;
        }
        return;
    }
    if (!isRecord(value)) return;

    for (const [key, entry] of Object.entries(value)) {
        if (forbiddenRequestKeys.has(key)) return key;
        const result = findForbiddenKey(entry);
        if (result) return result;
    }
}

function readMaximumSteps(value: unknown): number | undefined {
    if (!isRecord(value) || value.maxSteps === undefined) return;
    return typeof value.maxSteps === 'number' ? value.maxSteps : Number.NaN;
}

function hasRequestBody(method: string): boolean {
    return ['PATCH', 'POST', 'PUT'].includes(method.toUpperCase());
}

function isStateChangingMethod(method: string): boolean {
    return ['DELETE', 'PATCH', 'POST', 'PUT'].includes(method.toUpperCase());
}

function isAllowedMutation(method: string, pathname: string): boolean {
    if (method.toUpperCase() !== 'POST') return false;

    if (pathname.startsWith(`${agentPath}/`)) {
        const suffix = pathname.slice(agentPath.length + 1);
        return (
            isAgentModelExecutionPath(pathname) ||
            /^threads\/(?:abort|subscribe)$/.test(suffix) ||
            /^tools\/development-principal-verification\/execute$/.test(suffix)
        );
    }

    if (pathname === '/api/tools/development-principal-verification/execute') {
        return true;
    }

    const workflowPrefixes = [
        '/api/workflows/development-verification-workflow/',
        '/api/workflows/developmentVerificationWorkflow/',
    ];
    return workflowPrefixes.some((prefix) => {
        if (!pathname.startsWith(prefix)) return false;
        const suffix = pathname.slice(prefix.length);
        return (
            ['create-run', 'start', 'stream'].includes(suffix) ||
            /^runs\/[A-Za-z0-9_-]+\/cancel$/.test(suffix)
        );
    });
}

function isAgentModelExecutionPath(pathname: string): boolean {
    if (!pathname.startsWith(`${agentPath}/`)) return false;
    const suffix = pathname.slice(agentPath.length + 1);
    return /^(?:generate(?:\/vnext|-legacy)?|stream(?:-legacy|-until-idle|VNext|\/vnext(?:\/ui)?|\/ui)?)$/.test(
        suffix,
    );
}

function isUnsupportedProxyPath(pathname: string): boolean {
    return [
        '/api/a2a',
        '/api/agent-controller',
        '/api/chat/completions',
        '/api/completions',
        '/api/conversations',
        '/api/responses',
    ].some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function withCompletionLease(
    response: Response,
    release: () => void,
): Response {
    const reader = response.body?.getReader();
    if (!reader) return response;

    let released = false;
    const releaseOnce = () => {
        if (released) return;
        released = true;
        release();
    };
    const body = new ReadableStream<Uint8Array>({
        async cancel(reason) {
            try {
                await reader.cancel(reason);
            } finally {
                releaseOnce();
            }
        },
        async pull(controller) {
            try {
                const result = await reader.read();
                if (result.done) {
                    releaseOnce();
                    controller.close();
                    return;
                }
                controller.enqueue(result.value);
            } catch (error) {
                releaseOnce();
                controller.error(error);
            }
        },
    });

    return new Response(body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
    });
}
