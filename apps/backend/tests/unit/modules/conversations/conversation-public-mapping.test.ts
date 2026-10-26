import { expect, it } from 'vitest';
import { ConversationTurnSchema } from '@languon/contracts';
import { turnView } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-persistence-context';

it('excludes private model and provider identity from the learner turn DTO without rewriting execution', () => {
    const row = {
        id: '00000000-0000-4000-8000-000000000001',
        conversationId: '00000000-0000-4000-8000-000000000002',
        status: 'running' as const,
        failureCode: null,
        usage: {
            inputTokens: 10,
            outputTokens: 2,
            chargedCredits: '0',
            estimated: false,
        },
        billing: null,
        createdAt: new Date('2026-10-25T00:00:00.000Z'),
        updatedAt: new Date('2026-10-25T00:00:00.000Z'),
        execution: {
            snapshot: {
                providerId: 'openrouter',
                modelId: 'openai/gpt-6-luna',
                routingAuthority: {
                    candidates: [{ routeId: 'evolink/gpt-6-luna' }],
                },
            },
        },
    };
    const execution = structuredClone(row.execution);
    const dto = ConversationTurnSchema.parse(turnView(row));
    expect(dto.modelId).toBeNull();
    expect(dto.usage).toEqual(row.usage);
    expect(JSON.stringify(dto)).not.toMatch(
        /openrouter|evolink|gpt-6-luna|routingAuthority|snapshot|providerId/,
    );
    expect(row.execution).toEqual(execution);
});
