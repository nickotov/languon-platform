import { serializeLearningContentBrief } from './learning-content-transport';
import {
    tutorRequestStateKey,
    type TutorRequestState,
} from './tutor-request-contract';
import {
    buildTutorPlannerPrompt,
    tutorPlannerInputBytes,
} from './tutor-planner-prompt';
import { projectTutorUserMessage } from './tutor-message-context';
import { describe, expect, it } from 'vitest';
import {
    tutorAdmissionInputBytes,
    tutorReservedInputBytes,
    tutorMinimumInputBytes,
} from './tutor-context-budget';

const context = {
    message: {
        id: 'fixture',
        role: 'user' as const,
        content: 'Explain hola.',
        createdAt: '2026-10-22T00:00:00Z',
    },
    sourceContext: { title: 'Synthetic source' },
    preferences: {
        mode: 'auto' as const,
        replyLanguage: 'auto' as const,
        tone: 'neutral' as const,
        explanationLevel: 'auto' as const,
    },
};

describe('conversation admitted input budget', () => {
    it('fits a realistic Knowledge editor without reserving unrelated authoring and retrieval calls', () => {
        const input = {
            ...context,
            message: {
                ...context.message,
                modelContent: projectTutorUserMessage({
                    content:
                        'Generate ten French words with Russian translations.',
                    editorContext: {
                        content: 'Shopping vocabulary. '.repeat(750),
                    },
                }),
            },
            sourceContext: {
                sourceKind: 'knowledge',
                snapshotScope: 'workspace',
                blockProposalsAvailable: true,
                availableMaterialCount: 4,
                retrievedContextByteBound: 21015,
            },
        };

        expect(tutorReservedInputBytes(input) + 4096).toBeLessThan(64000);
    });

    it('counts retained pending instructions and proposal descriptors in the irreducible planner envelope', () => {
        const input = {
            ...context,
            sourceContext: {
                sourceKind: 'knowledge',
                snapshotScope: 'workspace',
                blockProposalsAvailable: true,
            },
        };
        const state: TutorRequestState = {
            pending: {
                tasks: Array.from({ length: 8 }, (_, index) => ({
                    id: `task-${index}`,
                    kind: 'grammar',
                    instruction: '\\'.repeat(2_500),
                    language: 'fr',
                })),
            },
            proposals: [
                {
                    id: '01900000-0000-4000-8000-000000000001',
                    summary: 'Retained exact proposal description.',
                },
            ],
        };
        const retained = [
            {
                key: tutorRequestStateKey,
                value: {
                    ...state,
                    pending: JSON.parse(
                        serializeLearningContentBrief(state.pending!),
                    ),
                },
            },
        ];
        const minimum = tutorMinimumInputBytes(input, retained);
        expect(minimum).toBe(tutorPlannerInputBytes(input, state) + 4096);
        expect(minimum).toBeGreaterThan(64_000);
        expect(tutorMinimumInputBytes(input)).toBeLessThan(64_000);
        expect(buildTutorPlannerPrompt(input, state)).toContain(
            'Retained exact proposal description.',
        );
    });

    it('keeps an older pending passage in server storage and budgets source descriptors regardless of the current editor', () => {
        const passage =
            'OLD_PENDING_SOURCE' + 'La source originale. '.repeat(1_700);
        const input = {
            ...context,
            message: {
                ...context.message,
                modelContent: projectTutorUserMessage({
                    content: 'French.',
                    editorContext: { content: 'CHANGED_CURRENT_EDITOR' },
                }),
            },
            sourceContext: {
                sourceKind: 'knowledge',
                snapshotScope: 'workspace',
                blockProposalsAvailable: true,
            },
        };
        const state: TutorRequestState = {
            pending: {
                tasks: [
                    {
                        id: 'grammar',
                        kind: 'grammar',
                        instruction: 'Explain the retained source.',
                        source: { kind: 'editor' },
                        sourceText: passage,
                    },
                ],
            },
            proposals: [],
        };
        const retained = [
            {
                key: tutorRequestStateKey,
                value: {
                    ...state,
                    pending: JSON.parse(
                        serializeLearningContentBrief(state.pending!),
                    ),
                },
            },
        ];
        const original = structuredClone(retained);
        const prompt = buildTutorPlannerPrompt(input, state);
        expect(prompt).not.toContain('OLD_PENDING_SOURCE');
        expect(prompt).toContain('CHANGED_CURRENT_EDITOR');
        expect(prompt).toContain('sourceTextRef');
        expect(prompt).toContain('server-pending-registry');
        expect(prompt).toContain(String(passage.length));
        expect(tutorMinimumInputBytes(input, retained)).toBe(
            tutorPlannerInputBytes(input, state) + 4096,
        );

        expect(tutorMinimumInputBytes(input, retained)).toBeLessThan(64_000);
        expect(tutorAdmissionInputBytes(input, [], retained)).toBeLessThan(
            64_000,
        );

        expect(retained).toEqual(original);
    });

    it('bounds a short new prompt using real framing instead of the model context maximum', () => {
        const bound = tutorAdmissionInputBytes(context, [], []);
        expect(bound).toBeGreaterThan(tutorReservedInputBytes(context) + 4096);
        expect(bound).toBeLessThan(64000);
    });

    it('includes retained source, history and memory bytes before dispatch', () => {
        const initial = tutorAdmissionInputBytes(context, [], []);
        const expanded = tutorAdmissionInputBytes(
            {
                ...context,
                sourceContext: {
                    title: 'Synthetic source',
                    text: '界'.repeat(1000),
                },
            },
            [{ text: 'history'.repeat(1000) }],
            [{ observations: 'memory'.repeat(1000) }],
        );

        expect(expanded - initial).toBeGreaterThan(15000);
    });
});
