import { ConversationDetailSchema } from '@languon/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { conversationUIMessages } from '@/fsd/entities/conversation';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import type * as StreamingTextModule from '../src/fsd/widgets/contextual-assistant/hooks/use-streaming-text';

const rowExecutions = vi.hoisted(() => new Map<string, number>());

vi.mock(
    '../src/fsd/widgets/contextual-assistant/hooks/use-streaming-text',
    async (importOriginal) => {
        const actual = await importOriginal<typeof StreamingTextModule>();

        return {
            ...actual,
            useStreamingText(content: string, streaming: boolean) {
                rowExecutions.set(
                    content,
                    (rowExecutions.get(content) ?? 0) + 1,
                );

                return actual.useStreamingText(content, streaming);
            },
        };
    },
);

import { ConversationMessages } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/ui/conversation-messages/conversation-messages';

const conversationId = '00000000-0000-4000-8000-000000000001';
const date = '2026-11-25T10:00:00.000Z';
const completedContent = Array.from(
    { length: 5 },
    (_, index) => `Completed response ${index + 1}`,
);
const messageIds = Array.from(
    { length: 6 },
    (_, index) =>
        `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
);

const detail = ConversationDetailSchema.parse({
    conversation: {
        id: conversationId,
        title: 'Render profile',
        source: { kind: 'text', id: conversationId },
        preferences: {},
        version: 1,
        createdAt: date,
        updatedAt: date,
    },
    messages: [...completedContent, 'Live response'].map((content, index) => ({
        id: messageIds[index],
        conversationId,
        turnId: messageIds[index],
        role: 'assistant',
        content,
        attachments: [],
        toolCalls: [],
        status: index === 5 ? 'streaming' : 'complete',
        sourceVersion: '1',
        sourceProvenance: 'saved',
        createdAt: date,
    })),
    turns: messageIds.map((id, index) => ({
        id,
        conversationId,
        modelId: null,
        status: index === 5 ? 'running' : 'succeeded',
        failureCode: null,
        usage: {
            inputTokens: 0,
            outputTokens: 0,
            chargedCredits: '0',
            estimated: false,
        },
        createdAt: date,
        updatedAt: date,
    })),
    drafts: [],
});
const initialMessages = conversationUIMessages(detail);

function Transcript({
    liveContent,
    onPropose,
    active = true,
}: {
    liveContent: string;
    onPropose?: () => void;
    active?: boolean;
}) {
    const live = initialMessages.at(-1)!;
    const messages = [
        ...initialMessages.slice(0, -1),
        {
            ...live,
            parts: [{ type: 'text' as const, text: liveContent }],
        },
    ];

    return (
        <ConversationMessages
            active={active}
            detail={detail}
            uiMessages={messages}
            onRetry={() => undefined}
            onPropose={onPropose}
        />
    );
}

beforeEach(() => rowExecutions.clear());

it('rerenders only the live row when a response grows', () => {
    const view = render(
        <I18nProvider locale='en' messages={en}>
            <Transcript
                liveContent='Live response'
                onPropose={() => undefined}
            />
        </I18nProvider>,
    );

    view.rerender(
        <I18nProvider locale='en' messages={en}>
            <Transcript
                liveContent='Live response updated'
                onPropose={() => undefined}
            />
        </I18nProvider>,
    );

    const executions = [...rowExecutions.values()].reduce(
        (total, count) => total + count,
        0,
    );

    expect(executions).toBe(7);
    for (const content of completedContent) {
        expect(rowExecutions.get(content)).toBe(1);
    }
});

it('preserves optional action availability across memoized row updates', () => {
    const propose = vi.fn();
    const view = render(
        <I18nProvider locale='en' messages={en}>
            <Transcript liveContent='Live response' />
        </I18nProvider>,
    );

    expect(
        screen.queryByRole('button', { name: 'Prepare a Knowledge note' }),
    ).not.toBeInTheDocument();

    view.rerender(
        <I18nProvider locale='en' messages={en}>
            <Transcript
                active={false}
                liveContent='Live response'
                onPropose={propose}
            />
        </I18nProvider>,
    );

    const actions = screen.getAllByRole('button', {
        name: 'Prepare a Knowledge note',
    });

    fireEvent.click(actions[0]!);

    expect(propose).toHaveBeenCalledOnce();

    view.rerender(
        <I18nProvider locale='en' messages={en}>
            <Transcript active={false} liveContent='Live response' />
        </I18nProvider>,
    );

    expect(
        screen.queryByRole('button', { name: 'Prepare a Knowledge note' }),
    ).not.toBeInTheDocument();
});

const failedMessageId = '00000000-0000-4000-8000-000000000010';
const failedDetail = ConversationDetailSchema.parse({
    conversation: detail.conversation,
    messages: [
        {
            id: failedMessageId,
            conversationId,
            turnId: failedMessageId,
            role: 'user',
            content: 'Explain this sentence',
            attachments: [],
            toolCalls: [],
            status: 'complete',
            sourceVersion: '1',
            sourceProvenance: 'saved',
            createdAt: date,
        },
    ],
    turns: [
        {
            id: failedMessageId,
            conversationId,
            modelId: null,
            status: 'failed',
            failureCode: null,
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                chargedCredits: '0',
                estimated: false,
            },
            createdAt: date,
            updatedAt: date,
        },
    ],
    drafts: [],
});
const failedMessages = conversationUIMessages(failedDetail);

function FailedTranscript({
    onRetry,
}: {
    onRetry: (turn: (typeof failedDetail.turns)[number]) => void;
}) {
    return (
        <ConversationMessages
            active={false}
            detail={failedDetail}
            uiMessages={failedMessages}
            onRetry={onRetry}
        />
    );
}

it('keeps memoized rows connected to the latest action callback', () => {
    const firstRetry = vi.fn();
    const latestRetry = vi.fn();
    const view = render(
        <I18nProvider locale='en' messages={en}>
            <FailedTranscript onRetry={firstRetry} />
        </I18nProvider>,
    );

    view.rerender(
        <I18nProvider locale='en' messages={en}>
            <FailedTranscript onRetry={latestRetry} />
        </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry response' }));

    expect(firstRetry).not.toHaveBeenCalled();
    expect(latestRetry).toHaveBeenCalledExactlyOnceWith(failedDetail.turns[0]);
});
