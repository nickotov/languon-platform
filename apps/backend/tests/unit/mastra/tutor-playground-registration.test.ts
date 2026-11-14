import { describe, expect, it } from 'vitest';
import { namedExerciseToolDefinitions } from '../../../src/modules/conversations/infrastructure/ai/learning-content-tools';
import { createCanonicalMastra } from '../../../src/mastra/composition';
import { DevelopmentVerificationService } from '../../../src/modules/development-harness/application/development-verification-service';
import { createTutorPlaygroundPrimitives } from '../../../src/modules/development-harness/infrastructure/mastra/tutor-playground-primitives';
import type { ConversationsDatabase } from '../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';

describe('canonical tutor playground registration', () => {
    it('registers synthetic workflow and tools only in explicit development composition', () => {
        // Discovery must not query persistence or dispatch a provider. Real execution
        // is covered separately against disposable playground PostgreSQL.
        const tutorPlayground = createTutorPlaygroundPrimitives({
            database: {} as ConversationsDatabase,
        });
        const development = createCanonicalMastra({
            developmentHarness: {
                fallbackModelId: 'deepseek/deepseek-flash',
                modelId: 'deepseek/deepseek-flash',
                service: new DevelopmentVerificationService(
                    { findById: async () => null },
                    '00000000-0000-4000-8000-000000000019',
                ),
                tutorPlayground,
            },
        });

        expect(Object.keys(development.listTools() ?? {})).toEqual(
            expect.arrayContaining([
                'development-principal-verification',
                'generate_vocabulary',
                'generate_grammar',
                'generate_bilingual_text',
                'generate_exercises',
                'read-playground-proposal',
                ...namedExerciseToolDefinitions.map(
                    (definition) => definition.id,
                ),
            ]),
        );

        expect(namedExerciseToolDefinitions).toHaveLength(19);
        expect(
            Object.keys(tutorPlayground.tools).filter((id) =>
                id.startsWith('generate_exercise_'),
            ),
        ).toHaveLength(19);

        for (const definition of namedExerciseToolDefinitions) {
            expect(tutorPlayground.toolInputs[definition.id]).toBe(
                definition.inputSchema,
            );

            expect(
                development.getTool(definition.id).requestContextSchema,
            ).toBe(tutorPlayground.requestContextSchema);
        }

        expect(Object.keys(development.listWorkflows())).toEqual(
            expect.arrayContaining([
                'runTutorTurn',
                'developmentVerificationWorkflow',
            ]),
        );

        expect(Object.keys(development.listAgents())).toEqual([
            'developmentVerificationAgent',
        ]);

        expect(
            development.getTool('generate_vocabulary').requestContextSchema,
        ).toBe(tutorPlayground.requestContextSchema);

        expect(Object.keys(createCanonicalMastra().listTools() ?? {})).toEqual(
            [],
        );

        expect(Object.keys(createCanonicalMastra().listWorkflows())).toEqual(
            [],
        );
    });
});
