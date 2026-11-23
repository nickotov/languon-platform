import { expect, it } from 'vitest';
import {
    ConversationMessageSchema,
    KnowledgeContentProposalSchema,
    type GenerationRunSummary,
} from '@languon/contracts';
import type { ConversationUIMessage } from '../src/fsd/entities/conversation';
import { groupLessonResults } from '../src/fsd/widgets/contextual-assistant/lib/group-lesson-results';
import { lessonRun, lessonTurn } from './lesson-run-fixture';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';

function answer(turnId: string, published: boolean): ConversationUIMessage {
    const metadata = ConversationMessageSchema.parse({
        id: turnId,
        turnId,
        conversationId: first,
        role: 'assistant',
        content: 'Ready.',
        status: 'complete',
        sourceVersion: null,
        attachments: [],
        sourceProvenance: 'draft',
        toolCalls: published
            ? [
                  {
                      id: 'publish',
                      name: 'propose_learning_content',
                      state: 'succeeded',
                  },
              ]
            : [],
        createdAt: lessonRun.createdAt,
    });

    return { id: metadata.id, role: metadata.role, metadata, parts: [] };
}

it('attaches each completed run to its publishing answer even with history in a different order and an older unlisted proposal', () => {
    const recent: GenerationRunSummary = {
        ...lessonRun,
        id: first,
        state: 'completed',
        proposalId: second,
    };
    const older: GenerationRunSummary = {
        ...recent,
        id: second,
        proposalId: first,
    };
    const paused: GenerationRunSummary = { ...lessonRun, id: third };
    const listed = KnowledgeContentProposalSchema.parse({
        id: second,
        turnId: first,
        conversationId: first,
        noteId: first,
        branchId: first,
        baseBranchVersion: 1,
        isCompletedLesson: true,
        body: {
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Reading' }],
                    },
                ],
            },
        },
        createdAt: lessonRun.createdAt,
        appliedAt: null,
        appliedBranchVersion: null,
    });
    const turns = new Map(
        [first, second, third].map((id) => [
            id,
            { ...lessonTurn, id, generationRunId: id },
        ]),
    );
    const messages = [
        answer(second, true),
        answer(third, false),
        answer(first, false),
    ];
    const results = groupLessonResults(
        [recent, paused, older],
        messages,
        turns,
        [listed],
    );

    expect(results.byTurn.get(first)).toEqual({
        run: recent,
        proposal: listed,
    });

    expect(results.byTurn.get(second)).toEqual({ run: older });
    expect(results.remaining).toEqual([paused]);

    // The run can finish before its response arrives. Keep the plan accessible at the end in that interval.
    expect(groupLessonResults([recent], [], turns, [listed]).remaining).toEqual(
        [recent],
    );
});
