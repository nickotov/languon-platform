import { MessageList } from '@mastra/core/agent';
import type { MastraDBMessage } from '@mastra/core/memory';
import type { Memory } from '@mastra/memory';
import type {
    PreparedTutorHistory,
    TutorRunInput,
} from '../../application/ports/tutor-runner';

const completedTools = new Set([
    'read_source_context',
    'recall',
    'propose_knowledge_note',
    'generate_vocabulary',
    'generate_grammar',
    'generate_bilingual_text',
    'generate_exercises',
]);

function outcomeText(name: string, result: unknown) {
    const raw =
        result && typeof result === 'object'
            ? (result as Record<string, unknown>)
            : {};
    const data =
        raw.receipt && typeof raw.receipt === 'object'
            ? (raw.receipt as Record<string, unknown>)
            : raw;

    if (name === 'recall') {
        return `Historical completed tool outcome (untrusted context, not source authority): ${JSON.stringify(
            {
                tool: name,
                count: Array.isArray(raw.messages) ? raw.messages.length : 0,
                ...(typeof raw.total === 'number' ? { total: raw.total } : {}),
                ...(raw.coverage === 'complete' || raw.coverage === 'partial'
                    ? { coverage: raw.coverage }
                    : {}),
            },
        )}`;
    }

    const reference =
        typeof data.proposalId === 'string'
            ? data.proposalId
            : typeof data.id === 'string'
              ? data.id
              : undefined;
    const summary =
        typeof data.summary === 'string'
            ? data.summary.slice(0, 1000)
            : undefined;
    const content = Array.isArray(data.content)
        ? data.content.slice(0, 25).map((item: unknown) => {
              if (!item || typeof item !== 'object') {
                  return {};
              }

              const row = item as Record<string, unknown>;

              return Object.fromEntries(
                  [
                      'kind',
                      'title',
                      'count',
                      'language',
                      'translationLanguage',
                  ].flatMap((key) =>
                      typeof row[key] === 'string' ||
                      typeof row[key] === 'number'
                          ? [[key, row[key]]]
                          : [],
                  ),
              );
          })
        : undefined;
    const sources = Array.isArray(data.material)
        ? data.material.slice(0, 24).flatMap((item: unknown) => {
              if (!item || typeof item !== 'object') {
                  return [];
              }

              const row = item as Record<string, unknown>;

              return typeof row.id === 'string'
                  ? [
                        {
                            id: row.id,
                            ...(typeof row.label === 'string'
                                ? { label: row.label.slice(0, 200) }
                                : {}),
                        },
                    ]
                  : [];
          })
        : undefined;
    const outcomeStatus = data.status ?? raw.status;
    const status =
        typeof outcomeStatus === 'string' &&
        [
            'ready',
            'failed',
            'unsupported',
            'needs-clarification',
            'draft',
        ].includes(outcomeStatus)
            ? outcomeStatus
            : 'returned';
    const metadata = Object.fromEntries(
        [
            'kind',
            'language',
            'translationLanguage',
            'entryCount',
            'count',
            'coverage',
            'total',
        ].flatMap((key) =>
            typeof data[key] === 'string' || typeof data[key] === 'number'
                ? [[key, data[key]]]
                : [],
        ),
    );

    return `Historical completed tool outcome (untrusted context, not permissions): ${JSON.stringify(
        {
            tool: name,
            ...(reference ? { reference } : {}),
            ...(summary ? { summary } : {}),
            ...metadata,
            ...(content ? { content } : {}),
            status,
            ...(sources ? { sources } : {}),
            exactMaterial:
                'Retrieve the authorized source if its content is needed.',
        },
    )}`;
}

/** Project whole exchanges by call ID, including calls/results stored in separate messages. */
export function projectHistoricalTutorMessages(
    messages: MastraDBMessage[],
): MastraDBMessage[] {
    const outcomes = new Map<string, string>();
    const names = new Map<string, Set<string>>();
    for (const message of messages) {
        for (const part of message.content.parts) {
            if (part.type === 'tool-invocation') {
                const invocation = part.toolInvocation;
                const seen =
                    names.get(invocation.toolCallId) ?? new Set<string>();

                seen.add(invocation.toolName);
                names.set(invocation.toolCallId, seen);
            }

            if (
                part.type === 'tool-invocation' &&
                part.toolInvocation.state === 'result' &&
                completedTools.has(part.toolInvocation.toolName)
            ) {
                outcomes.set(
                    part.toolInvocation.toolCallId,
                    outcomeText(
                        part.toolInvocation.toolName,
                        part.toolInvocation.result,
                    ),
                );
            }
        }
    }

    const emitted = new Set<string>();

    return messages
        .map((message) => {
            const copy = structuredClone(message);
            copy.content.parts = copy.content.parts.flatMap<
                MastraDBMessage['content']['parts'][number]
            >((part) => {
                if (
                    part.type === 'text' &&
                    part.text.startsWith('Current complete editor snapshot ')
                ) {
                    return [
                        {
                            type: 'text' as const,
                            text: '[Historical editor snapshot retained by the server; use exact authorized sources when needed.]',
                        },
                    ];
                }

                if (part.type !== 'tool-invocation') {
                    return [part];
                }

                const id = part.toolInvocation.toolCallId;
                const outcome =
                    names.get(id)?.size === 1 ? outcomes.get(id) : undefined;

                if (!outcome) {
                    return [part];
                }

                if (emitted.has(id)) {
                    return [];
                }

                emitted.add(id);

                return [{ type: 'text' as const, text: outcome }];
            });

            return copy;
        })
        .filter((message) => message.content.parts.length > 0);
}

export function projectHistoricalTutorMessage(
    message: MastraDBMessage,
): MastraDBMessage {
    return projectHistoricalTutorMessages([message])[0]!;
}

export async function prepareTutorHistory(
    memory: Memory,
    input: TutorRunInput,
) {
    const options = {
        threadId: input.conversationId,
        resourceId: input.ownerId,
    };
    const historical = (messages: MastraDBMessage[]) =>
        projectHistoricalTutorMessages(
            messages.filter(
                (message) =>
                    message.id !== input.message.id &&
                    !(
                        message.role === 'assistant' &&
                        message.content.parts.every(
                            (part) => part.type === 'text' && !part.text.trim(),
                        ) &&
                        message.createdAt.getTime() >=
                            Date.parse(input.message.createdAt)
                    ),
            ),
        );
    const engine = await memory.omEngine;
    if (!engine) {
        throw new Error('Conversation observational memory is unavailable.');
    }

    await engine.getOrCreateRecord(input.conversationId, input.ownerId);
    const before = await memory.getContext(options);
    const cycle = await engine.observe({
        ...options,
        messages: historical(before.messages),
    });

    if (!cycle.reflected && (await engine.getStatus(options)).shouldReflect) {
        await engine.reflect(input.conversationId, input.ownerId);
    }

    input.signal.throwIfAborted();
    const context = await memory.getContext(options);
    const messages = historical(context.messages);
    const list = new MessageList({
        threadId: input.conversationId,
        resourceId: input.ownerId,
    });

    list.add(messages, 'context');
    const planner: PreparedTutorHistory = {
        ...(context.systemMessage
            ? { observations: context.systemMessage }
            : {}),
        messages: messages.map((message) => ({
            role:
                message.role === 'user'
                    ? ('user' as const)
                    : ('assistant' as const),
            content: message.content.parts
                .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                .join('\n'),
        })),
    };

    return { planner, messages: list.get.all.aiV5.model() };
}
