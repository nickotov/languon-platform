import { listeningRecordingFailure } from '../../application/listening-script';
import { applyExercisePickerChoices } from '../../application/exercise-picker-resolution';
import { applyExerciseMentionChoices } from '../../application/exercise-mention-resolution';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createLearningContentAuthoring } from './learning-content-authoring';
import {
    createGenerationPlan,
    restoreGenerationExecution,
} from './learning-generation-plan';
import type { LearningContentBrief } from '../../application/learning-content-contract';

const recording: LearningContentBrief = {
    tasks: [
        {
            id: 'scene',
            kind: 'audio',
            language: 'fr',
            speakerCount: 2,
            maxDurationSeconds: 60,
            instruction: 'A dialogue at the station.',
        },
    ],
};
const task = {
    id: 'listen',
    kind: 'exercises' as const,
    instruction: 'Transcribe the selected line.',
    language: 'fr',
    explanationLanguage: 'en',
    source: { kind: 'task' as const, taskId: 'scene' },
    activities: [{ activityId: 'L04' as const, count: 1 }],
};
const script = {
    title: 'À la gare',
    utterances: [
        { speaker: 'Luc', text: 'Bonjour !' },
        { speaker: 'Marie', text: 'Deux billets, merci.' },
    ],
};
const run = { runId: randomUUID(), revision: 1 };
const segmentId = randomUUID();
const audio = {
    id: randomUUID(),
    type: 'audio' as const,
    language: 'fr',
    assetId: randomUUID(),
    transcript: {
        language: 'fr',
        segments: [
            {
                id: segmentId,
                text: 'Bonjour !',
                timing: { startSeconds: 0, endSeconds: 1 },
            },
        ],
    },
};

describe('listening lesson generation', () => {
    it.each([
        ['speech_decoder_unavailable', 'speech-decoder-unavailable'],
        ['speech_duration_exceeded', 'recording-too-long'],
        ['speech_voice_unavailable', 'speech-voice-unavailable'],
    ])('reports the specific recording failure %s', (code, reason) => {
        expect(
            listeningRecordingFailure(
                { code, privateDetail: 'fixture' },
                'scene',
            ),
        ).toMatchObject({
            generationFailure: {
                code: 'admission-blocked',
                admissionReason: reason,
                taskId: 'scene',
            },
        });
    });

    it('saves the recording before exercises and restores a captured playable source', () => {
        const { plan, sources } = createGenerationPlan(
            { tasks: [...recording.tasks, task] },
            new Map(),
            'en',
        );

        expect(
            restoreGenerationExecution({
                ...run,
                plan,
                sources,
                artifacts: [],
                purpose: 'generation',
            }).brief.tasks,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'audio',
                    speakerCount: 2,
                    maxDurationSeconds: 60,
                }),
                expect.objectContaining({
                    source: { kind: 'task', taskId: 'scene' },
                }),
            ]),
        );

        expect(() =>
            createGenerationPlan(
                {
                    tasks: [...recording.tasks, task],
                    outputOrder: ['listen', 'scene'],
                },
                new Map(),
                'en',
            ),
        ).toThrow();

        const existing = createGenerationPlan(
            {
                tasks: [
                    { ...task, source: { kind: 'editor', blockId: audio.id } },
                ],
            },
            new Map([['listen', { blocks: [audio] }]]),
            'en',
        );

        expect(existing.plan.sources[0]).toMatchObject({
            kind: 'audio',
            reference: { kind: 'block', blockId: audio.id },
        });

        expect(existing.plan.tasks.map((item) => item.kind)).toEqual([
            'exercises',
        ]);
    });

    it('accepts only authored script fields and publishes the host-produced recording', async () => {
        const generate = vi
            .fn()
            .mockResolvedValueOnce({
                tasks: [{ taskId: 'scene', blocks: [audio] }],
            })
            .mockResolvedValue({
                tasks: [{ taskId: 'scene', blocks: [script] }],
            });
        const materializeListeningRecording = vi.fn().mockResolvedValue(audio);
        const checkpoint = vi.fn();
        const result = await createLearningContentAuthoring({
            run,
            generate,
            materializeListeningRecording,
            onValidatedBatch: checkpoint,
            readBudget: () => ({
                remainingCalls: 5,
                remainingOutputTokens: 12_000,
            }),
        }).generate(recording, new AbortController().signal);

        expect(result.status).toBe('ready');
        expect(generate).toHaveBeenCalledTimes(2);
        expect(materializeListeningRecording).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ ...run, taskId: 'scene', script }),
        );

        expect(checkpoint).toHaveBeenCalledWith(
            expect.objectContaining({
                results: [{ taskId: 'scene', blocks: [audio] }],
            }),
        );
    });

    it.each([
        ['fr', 'Le train arrive à la gare dans quelques minutes.'],
        ['zh', '今天我们一起乘坐火车前往北京参观博物馆。'],
    ])(
        'repairs an overlong %s script before spending on speech',
        async (language, longLine) => {
            const generate = vi
                .fn()
                .mockResolvedValueOnce({
                    tasks: [
                        {
                            taskId: 'scene',
                            blocks: [
                                {
                                    ...script,
                                    utterances: script.utterances.map(
                                        (line) => ({ ...line, text: longLine }),
                                    ),
                                },
                            ],
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    tasks: [{ taskId: 'scene', blocks: [script] }],
                });
            const materialize = vi.fn().mockResolvedValue({
                ...audio,
                language,
                transcript: { ...audio.transcript, language },
            });
            const result = await createLearningContentAuthoring({
                run,
                generate,
                materializeListeningRecording: materialize,
                onValidatedBatch: async () => {},
                readBudget: () => ({
                    remainingCalls: 5,
                    remainingOutputTokens: 12_000,
                }),
            }).generate(
                {
                    tasks: [
                        {
                            ...recording.tasks[0]!,
                            language,
                            maxDurationSeconds: 4,
                        },
                    ],
                },
                new AbortController().signal,
            );

            expect(result.status).toBe('ready');
            expect(generate).toHaveBeenCalledTimes(2);
            expect(generate.mock.calls[1]![0].prompt).toContain(
                'Recording must fit 4 seconds',
            );

            expect(materialize).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ script, maxDurationSeconds: 4 }),
            );
        },
    );

    it('grounds a dictation in the completed recording and publishes one playable set', async () => {
        const generate = vi
            .fn()
            .mockResolvedValueOnce({
                tasks: [{ taskId: 'scene', blocks: [script] }],
            })
            .mockResolvedValueOnce({
                tasks: [
                    {
                        taskId: 'listen',
                        blocks: [
                            {
                                activityId: 'L02',
                                title: 'Dictée',
                                question:
                                    'Écoutez et écrivez la première réplique.',
                                objective: 'Transcribe a greeting.',
                                explanation: 'A short, polite greeting.',
                                sourceBindings: [
                                    {
                                        kind: 'audio',
                                        blockId: audio.id,
                                        segmentIds: [segmentId],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });
        const result = await createLearningContentAuthoring({
            run,
            generate,
            materializeListeningRecording: async () => audio,
            onValidatedBatch: async () => {},
            readBudget: () => ({
                remainingCalls: 5,
                remainingOutputTokens: 12000,
            }),
        }).generate(
            {
                tasks: [
                    ...recording.tasks,
                    {
                        ...task,
                        count: 1,
                        activities: [{ activityId: 'L02', count: 1 }],
                    },
                ],
            },
            new AbortController().signal,
        );

        expect(result).toMatchObject({
            status: 'ready',
            proposal: {
                body: {
                    document: {
                        content: [
                            { attrs: { block: audio } },
                            {
                                attrs: {
                                    block: {
                                        type: 'exercise',
                                        referenceAnswer: 'Bonjour !',
                                        source: {
                                            blockId: audio.id,
                                            segmentIds: [segmentId],
                                        },
                                        group: { parentBlockId: audio.id },
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        });

        expect(generate).toHaveBeenCalledTimes(2);
    });

    it('pins selected listening exercises to an explicitly requested new recording', () => {
        const planned = {
            kind: 'generate' as const,
            replyLanguage: 'en' as const,
            brief: { tasks: [...recording.tasks, task] },
        };
        const picker = applyExercisePickerChoices(
            {
                language: 'fr',
                explanationLanguage: 'en',
                difficulty: 'intermediate',
                mode: 'selected',
                count: 1,
                activities: task.activities,
            },
            planned,
            false,
            [],
        );

        expect(picker).toMatchObject({
            kind: 'generate',
            brief: {
                tasks: [
                    { kind: 'audio' },
                    { kind: 'exercises', source: task.source },
                ],
            },
        });

        const mention = applyExerciseMentionChoices(
            [
                {
                    kind: 'exercise',
                    activityId: 'L04',
                    catalogVersion: 1,
                    start: 0,
                    end: 3,
                },
            ],
            planned,
            false,
            undefined,
        );

        expect(mention).toMatchObject({
            kind: 'generate',
            brief: {
                tasks: [
                    { kind: 'audio' },
                    { kind: 'exercises', source: task.source },
                ],
            },
        });
    });

    it('never requests speech from direct tool invocations without a durable run', async () => {
        const generate = vi.fn();
        await expect(
            createLearningContentAuthoring({ generate }).generate(
                recording,
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: 'generation_scope_change' });

        expect(generate).not.toHaveBeenCalled();
    });
});
