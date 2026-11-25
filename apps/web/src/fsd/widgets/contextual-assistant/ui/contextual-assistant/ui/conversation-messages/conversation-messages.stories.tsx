import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ConversationDetailSchema } from '@languon/contracts';
import { conversationUIMessages } from '@/fsd/entities/conversation';
import { ConversationMessages } from './conversation-messages';

const conversationId = '10000000-0000-4000-8000-000000000003';
const turnId = '10000000-0000-4000-8000-000000000004';
const date = '2026-01-15T09:00:00.000Z';

function transcript(streaming: boolean) {
    return ConversationDetailSchema.parse({
        conversation: {
            id: conversationId,
            title: 'At the market',
            source: { kind: 'text', id: conversationId },
            preferences: {},
            version: 1,
            createdAt: date,
            updatedAt: date,
        },
        messages: [
            {
                id: '10000000-0000-4000-8000-000000000005',
                role: 'user',
                content: 'How do I ask the price in Spanish?',
                status: 'complete',
            },
            {
                id: '10000000-0000-4000-8000-000000000006',
                role: 'assistant',
                content:
                    'Try **¿Cuánto cuesta?** It means “How much does it cost?”',
                status: streaming ? 'streaming' : 'complete',
            },
        ].map((message) => ({
            ...message,
            conversationId,
            turnId,
            attachments: [],
            toolCalls: [],
            sourceVersion: '1',
            sourceProvenance: 'saved',
            createdAt: date,
        })),
        turns: [
            {
                id: turnId,
                conversationId,
                modelId: null,
                status: streaming ? 'running' : 'succeeded',
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
}

const completed = transcript(false);
const streaming = transcript(true);
const meta = {
    title: 'Widgets/Contextual assistant/Transcript',
    component: ConversationMessages,
    args: {
        active: false,
        detail: completed,
        uiMessages: conversationUIMessages(completed),
        onRetry: fn(),
        onSuggest: fn(),
    },
} satisfies Meta<typeof ConversationMessages>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
    args: { detail: { ...completed, messages: [], turns: [] }, uiMessages: [] },
};
export const Completed: Story = {};
export const StreamingPreview: Story = {
    args: {
        active: true,
        detail: streaming,
        uiMessages: conversationUIMessages(streaming),
    },
};
