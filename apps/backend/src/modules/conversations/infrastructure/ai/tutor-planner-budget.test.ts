import { serializeLearningContentBrief } from '../../application/learning-content-transport';
import {
    tutorRequestStateKey,
    type TutorRequestState,
} from '../../application/tutor-request-contract';
import { describe, expect, it } from 'vitest';
import { CopiedAttachmentSchema } from '@languon/contracts';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import {
    tutorMinimumInputBytes,
    tutorReservedInputBytes,
} from '../../application/tutor-context-budget';
import {
    buildTutorPlannerPrompt,
    tutorPlannerInputBytes,
} from '../../application/tutor-planner-prompt';
import { projectTutorUserMessage } from '../../application/tutor-message-context';
import { TutorRequestResolutionSchema } from '../../application/tutor-request-contract';
import {
    createTutorRequestAgents,
    generateTutorObject,
} from './tutor-request-agents';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
} from './tutor-test-fixtures';
import { createTutorModelGate } from './accounted-tutor-model';

function inputFor(editor: string, nestedCard = false) {
    const card = {
        source: 'mot',
        translation: 'word',
        sourceLanguage: 'fr',
        targetLanguage: 'en',
        definition: '\\"'.repeat(500),
        definitionLanguage: 'en',
    };
    const attachments = nestedCard
        ? [
              CopiedAttachmentSchema.parse({
                  id: '01900000-0000-4000-8000-000000000001',
                  label: 'Nested card',
                  kind: 'dictionary-card',
                  card,
                  content: JSON.stringify(card),
              }),
          ]
        : [];
    const input: Pick<
        TutorRunInput,
        'message' | 'sourceContext' | 'preferences'
    > = {
        message: {
            id: 'synthetic-current',
            role: 'user',
            content: 'Generate vocabulary.',
            createdAt: '2026-11-06T00:00:00Z',
            modelContent: projectTutorUserMessage({
                content: 'Generate vocabulary.',
                attachments,
                editorContext: { content: editor },
            }),
        },
        sourceContext: {
            sourceKind: 'knowledge',
            snapshotScope: 'workspace',
            blockProposalsAvailable: true,
            availableMaterialCount: 4,
            retrievedContextByteBound: 21_015,
        },
        preferences: {
            mode: 'auto',
            replyLanguage: 'auto',
            tone: 'neutral',
            explanationLevel: 'auto',
        },
    };

    return input;
}

const emptyState: TutorRequestState = { pending: null, proposals: [] };
const requiredState: TutorRequestState = {
    pending: {
        tasks: Array.from({ length: 8 }, (_, index) => ({
            id: `pending-${index}`,
            kind: 'grammar',
            instruction: '\\'.repeat(2_500),
            language: 'fr',
        })),
    },
    proposals: [
        {
            id: '01900000-0000-4000-8000-000000000002',
            summary: '"'.repeat(2_000),
        },
    ],
};

describe('planner admission versus the real pinned SDK native boundary', () => {
    it.each([
        ['ordinary 16.7KB editor', 'A'.repeat(16_740), false, true, emptyState],
        ['quotes', '"'.repeat(13_000), false, false, emptyState],
        ['backslashes', '\\'.repeat(13_000), false, false, emptyState],
        [
            'control characters',
            '\u0000'.repeat(6_500),
            false,
            false,
            emptyState,
        ],
        ['nested copied card', '\\'.repeat(11_000), true, false, emptyState],
        [
            'retained pending scalar state and proposal catalog',
            'A',
            false,
            false,
            requiredState,
        ],
    ] as const)(
        'bounds %s using both JSON serialization layers',
        async (_name, editor, nested, fits, state) => {
            const input = inputFor(editor, nested);
            const before = structuredClone(input);
            const retained = [
                {
                    key: tutorRequestStateKey,
                    value: {
                        ...state,
                        pending: state.pending
                            ? JSON.parse(
                                  serializeLearningContentBrief(state.pending),
                              )
                            : null,
                    },
                },
            ];
            const provider = scriptedTutorModel([
                JSON.stringify({
                    kind: 'answer',
                    purpose: 'conversation',
                    replyLanguage: 'en',
                    documentUse: false,
                }),
            ]);
            const accounting = tutorAccountingFixture();
            const gate = createTutorModelGate({
                accounting,
                signal: new AbortController().signal,
                maxInputTokens: Number.MAX_SAFE_INTEGER,
            });
            const agents = createTutorRequestAgents({
                planningModel: gate.wrap(provider.model, 'planning'),
                authoringModel: provider.model,
            });

            await generateTutorObject({
                agent: agents.tutorRequestResolver,
                prompt: buildTutorPlannerPrompt(input, state),
                schema: TutorRequestResolutionSchema,
                signal: new AbortController().signal,
                operationId: 'synthetic-projection',
                maxOutputTokens: 2048,
            });

            const request = provider.requests[0]!;
            const actualBytes = Buffer.byteLength(
                JSON.stringify({
                    prompt: request.prompt,
                    tools: request.tools,
                }),
                'utf8',
            );
            const projectedBytes = tutorPlannerInputBytes(input, state);
            const admittedBytes =
                accounting.admit.mock.calls[0]?.[0].inputTokenEstimate;

            expect(admittedBytes).toBe(actualBytes);
            expect(
                tutorMinimumInputBytes(input, retained),
            ).toBeGreaterThanOrEqual(admittedBytes!);

            // The only projected overhead is a maximum-width timestamp instead of
            // today's SDK-created timestamp. Every prompt byte is accounted exactly.
            expect(projectedBytes).toBeGreaterThanOrEqual(actualBytes);
            expect(projectedBytes - actualBytes).toBeLessThan(16);
            expect(tutorReservedInputBytes(input, state)).toBe(projectedBytes);
            expect(
                tutorMinimumInputBytes(input, retained),
            ).toBeGreaterThanOrEqual(actualBytes);

            expect(tutorMinimumInputBytes(input, retained) <= 64_000).toBe(
                fits,
            );

            expect(actualBytes <= 64_000).toBe(fits);
            expect(input).toEqual(before);
        },
    );
});
