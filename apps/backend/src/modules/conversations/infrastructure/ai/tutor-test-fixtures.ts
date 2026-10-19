import { vi } from 'vitest';
import type {
    TutorAccountingPort,
    TutorMemoryMessage,
    TutorMemoryPort,
} from '../../application/ports/tutor-runner.js';
import type { TutorProviderModel } from './accounted-tutor-model.js';

/** Deterministic provider boundary: no network, environment credentials or provider SDK. */
export function scriptedTutorModel(
    responses: (
        string | { toolName: string; input: Record<string, unknown> }
    )[],
) {
    let index = 0;
    const requests: Parameters<TutorProviderModel['doStream']>[0][] = [];
    const next = (input: Parameters<TutorProviderModel['doStream']>[0]) => {
        requests.push(input);
        const text = responses[index++];
        if (text === undefined)
            throw new Error(
                'Unexpected model dispatch in deterministic fixture.',
            );
        return text;
    };
    const model: TutorProviderModel = {
        specificationVersion: 'v2',
        provider: 'deterministic-test',
        modelId: 'fake-tutor',
        supportedUrls: {},
        doGenerate: async (input) => {
            const response = next(input);
            return {
                content:
                    typeof response === 'string'
                        ? [{ type: 'text' as const, text: response }]
                        : [
                              {
                                  type: 'tool-call' as const,
                                  toolCallId: `call-${index}`,
                                  toolName: response.toolName,
                                  input: JSON.stringify(response.input),
                              },
                          ],
                finishReason:
                    typeof response === 'string'
                        ? ('stop' as const)
                        : ('tool-calls' as const),
                usage: { inputTokens: 50, outputTokens: 12, totalTokens: 62 },
                warnings: [],
            };
        },
        doStream: async (input) => {
            const text = next(input);
            return {
                stream: new ReadableStream({
                    start(controller) {
                        controller.enqueue({
                            type: 'stream-start',
                            warnings: [],
                        });
                        if (typeof text === 'string') {
                            controller.enqueue({
                                type: 'text-start',
                                id: 'text-1',
                            });
                            controller.enqueue({
                                type: 'text-delta',
                                id: 'text-1',
                                delta: text,
                            });
                            controller.enqueue({
                                type: 'text-end',
                                id: 'text-1',
                            });
                        } else
                            controller.enqueue({
                                type: 'tool-call',
                                toolCallId: `call-${index}`,
                                toolName: text.toolName,
                                input: JSON.stringify(text.input),
                            });
                        controller.enqueue({
                            type: 'finish',
                            finishReason:
                                typeof text === 'string'
                                    ? 'stop'
                                    : 'tool-calls',
                            usage: {
                                inputTokens: 50,
                                outputTokens: 12,
                                totalTokens: 62,
                            },
                        });
                        controller.close();
                    },
                }),
            };
        },
    };
    return { model, requests };
}

export function tutorAccountingFixture(): TutorAccountingPort & {
    admit: ReturnType<typeof vi.fn<TutorAccountingPort['admit']>>;
    settle: ReturnType<typeof vi.fn<TutorAccountingPort['settle']>>;
    fail: ReturnType<typeof vi.fn<TutorAccountingPort['fail']>>;
} {
    return {
        admit: vi.fn(async () => undefined),
        settle: vi.fn(async () => undefined),
        fail: vi.fn(async () => undefined),
    };
}

export function tutorMemoryFixture(seed: TutorMemoryMessage[] = []) {
    const messages = new Map(
        seed.map((message) => [message.id, structuredClone(message)]),
    );
    const state = new Map<string, Record<string, unknown>>();
    const port: TutorMemoryPort = {
        async listMessages(query) {
            const filtered = [...messages.values()].filter(
                (message) =>
                    (!query.ids || query.ids.includes(message.id)) &&
                    (!query.after || message.createdAt >= query.after) &&
                    (!query.before || message.createdAt <= query.before),
            );
            filtered.sort(
                (a, b) =>
                    (query.order === 'asc' ? 1 : -1) *
                    (a.createdAt.localeCompare(b.createdAt) ||
                        a.id.localeCompare(b.id)),
            );
            return {
                messages: structuredClone(
                    filtered.slice(query.offset, query.offset + query.limit),
                ),
                total: filtered.length,
            };
        },
        async saveMessages(incoming) {
            for (const message of incoming) {
                const previous = messages.get(message.id);
                messages.set(
                    message.id,
                    structuredClone({
                        ...message,
                        content:
                            previous?.role === 'user'
                                ? previous.content
                                : message.content,
                    }),
                );
            }
        },
        async readState(key) {
            return structuredClone(state.get(key) ?? null);
        },
        async writeState(entries) {
            for (const [key, value] of Object.entries(entries))
                state.set(key, structuredClone(value));
        },
    };
    return { port, messages, state };
}
