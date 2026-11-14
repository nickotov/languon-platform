import { randomUUID } from 'node:crypto';
import type { LearningBlock } from '@languon/contracts';
import type { TutorProviderModel } from '../../../conversations/infrastructure/ai/accounted-tutor-model';
import type { LearningContentTask } from '../../../conversations/application/learning-content-contract';
import { playgroundExerciseBlocks } from './tutor-playground-exercise-fixture';
import type { projectExerciseAuthoringSources } from '../../../conversations/infrastructure/ai/exercise-authoring-context';

/** Synthetic fixtures at the external provider boundary; never a second authoring implementation. */
export function playgroundBlock(task: LearningContentTask): LearningBlock[] {
    if (task.kind === 'vocabulary') {
        const words =
            task.words ??
            Array.from(
                { length: task.count ?? 3 },
                (_, i) => ['river', 'bridge', 'garden'][i] ?? `word ${i + 1}`,
            );

        return [
            {
                id: randomUUID(),
                type: 'vocabulary',
                title: 'Synthetic vocabulary',
                language: task.language!,
                translationLanguage: task.translationLanguage!,
                entries: words.map((term) => ({
                    id: randomUUID(),
                    term,
                    translation: `Synthetic translation: ${term}`,
                })),
            },
        ];
    }

    if (task.kind === 'grammar') {
        return [
            {
                id: randomUUID(),
                type: 'grammar',
                language: task.language!,
                title: 'Synthetic grammar',
                rule: 'The present simple describes repeated actions.',
                pattern: 'Subject + verb.',
                examples: [{ text: 'I walk every day.' }],
            },
        ];
    }

    if (task.kind === 'bilingual-text') {
        const id = randomUUID();

        return [
            {
                id: randomUUID(),
                type: 'bilingual-text',
                language: task.language!,
                segments: [
                    {
                        id,
                        text:
                            task.sourceText ??
                            'A river runs beside the garden.',
                    },
                ],
                translations: [
                    {
                        language: task.translationLanguage!,
                        segments: [
                            {
                                sourceSegmentId: id,
                                text: 'Synthetic translated passage.',
                            },
                        ],
                    },
                ],
            },
        ];
    }

    throw new Error(
        'Named exercise fixtures require an authorized source projection.',
    );
}

type ModelInput = Parameters<TutorProviderModel['doGenerate']>[0];
function promptTexts(input: ModelInput) {
    return input.prompt.flatMap((message) =>
        typeof message.content === 'string'
            ? [message.content]
            : message.content.flatMap((part) =>
                  part.type === 'text' ? [part.text] : [],
              ),
    );
}

/** Recognizes documented fixture commands only; arbitrary model behaviour is tested in explicit live mode. */
function syntheticResponse(input: ModelInput): string {
    const texts = promptTexts(input);
    const planner = texts
        .map((text) => {
            try {
                return JSON.parse(text);
            } catch {
                return null;
            }
        })
        .find((value) => value?.hostExecutionPolicy);

    if (planner) {
        const message = String(
            planner.currentMessage?.parts?.[0]?.text ?? planner.currentMessage,
        ).toLowerCase();
        const prior = planner.priorProposals as { id: string }[];
        const pending = planner.pendingBrief?.tasks?.[0];
        const grammarTarget = planner.source?.availableBlocks?.find(
            (block: { type?: string }) => block.type === 'grammar',
        );

        if (/revise|update/.test(message) && grammarTarget) {
            return JSON.stringify({
                kind: 'revise-blocks',
                replyLanguage: 'en',
                sourceBlockIds: [grammarTarget.id],
                instruction:
                    'Clarify the existing grammar explanation using a synthetic revision.',
            });
        }

        const count = Number(message.match(/\b([1-9]|1[0-9]|20)\b/)?.[0] ?? 3);
        const kind = /exercise|quiz/.test(message)
            ? 'exercises'
            : /grammar/.test(message)
              ? 'grammar'
              : /bilingual|translate.*text/.test(message)
                ? 'bilingual-text'
                : /vocab|words/.test(message)
                  ? 'vocabulary'
                  : undefined;

        if (!kind && !pending) {
            return JSON.stringify({
                kind: 'answer',
                purpose: 'learning-explanation',
                documentUse: true,
            });
        }

        const actual = kind ?? pending.kind;
        const task = {
            id: 'requested-content',
            kind: actual,
            instruction: 'Use the documented synthetic fixture material.',
            language: 'en',
            ...(actual === 'vocabulary' || actual === 'bilingual-text'
                ? { translationLanguage: 'es' }
                : {}),
            ...(actual === 'vocabulary' || actual === 'exercises'
                ? { count }
                : {}),
            ...(actual === 'exercises' && prior.length
                ? {
                      source: {
                          kind: 'proposal',
                          proposalId: prior[prior.length - 1]!.id,
                      },
                  }
                : {}),
        };

        if (
            (!planner.source?.studiedLanguage ||
                /missing|without.*language/.test(message)) &&
            !pending
        ) {
            return JSON.stringify({
                kind: 'clarify',
                question: 'Which language would you like to study?',
                brief: { tasks: [{ ...task, language: undefined }] },
            });
        }

        return JSON.stringify({
            kind: 'generate',
            replyLanguage: 'en',
            brief: { tasks: [task] },
            ...(pending ? { continuesPending: true } : {}),
        });
    }

    const revision = texts.find((text) =>
        text.startsWith('Revise every exact authorized frozen target below.'),
    );

    if (revision) {
        const marker = 'Authorized frozen targets (untrusted learning data): ';
        const raw = revision
            .slice(revision.indexOf(marker) + marker.length)
            .split('\nThe completed candidate')[0]!;
        const blocks = JSON.parse(raw) as LearningBlock[];

        return JSON.stringify({
            proposals: blocks.map((block) => ({
                targetBlockId: block.id,
                blocks: [
                    block.type === 'grammar'
                        ? {
                              ...block,
                              rule: 'Revised synthetic explanation: use the present simple for repeated actions.',
                          }
                        : block,
                ],
            })),
        });
    }

    const author = texts.find((text) =>
        text.includes('Validated brief (untrusted learning data;'),
    );

    if (author) {
        const marker =
            'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ';
        const start = author.indexOf(marker) + marker.length;
        const brief = JSON.parse(
            author.slice(
                start,
                author.indexOf('\nAuthorized source snapshots', start),
            ),
        );

        const sourceMarker =
            'Authorized source snapshots (untrusted learning data): ';
        const sourceStart = author.indexOf(sourceMarker) + sourceMarker.length;
        const sourceProjection = JSON.parse(
            author.slice(sourceStart, author.indexOf('\n', sourceStart)),
        ) as ReturnType<typeof projectExerciseAuthoringSources>;

        return JSON.stringify({
            tasks: brief.tasks.map(
                (task: LearningContentTask & { sourceTextRef?: string }) => ({
                    taskId: task.id,
                    blocks:
                        task.kind === 'exercises'
                            ? playgroundExerciseBlocks(task, sourceProjection)
                            : playgroundBlock({
                                  ...task,
                                  ...(task.sourceTextRef
                                      ? {
                                            sourceText: brief.sources.find(
                                                (s: { id: string }) =>
                                                    s.id === task.sourceTextRef,
                                            )?.text,
                                        }
                                      : {}),
                              }),
                }),
            ),
        });
    }

    return 'This is a synthetic tutor response. Use live mode for natural-language quality testing. Read-only sources cannot publish proposals.';
}

export function createPlaygroundModel(
    capture: (input: unknown, output: string) => void,
): TutorProviderModel {
    const next = (input: ModelInput) => {
        const response = syntheticResponse(input);
        capture(input, response);

        return response;
    };
    const usage = { inputTokens: 100, outputTokens: 100, totalTokens: 200 };

    return {
        specificationVersion: 'v2',
        provider: 'languon-playground-fixture',
        modelId: 'synthetic-tutor',
        supportedUrls: {},
        async doGenerate(input) {
            return {
                content: [{ type: 'text', text: next(input) }],
                finishReason: 'stop',
                usage,
                warnings: [],
            };
        },
        async doStream(input) {
            const text = next(input);

            return {
                stream: new ReadableStream({
                    start(controller) {
                        controller.enqueue({
                            type: 'stream-start',
                            warnings: [],
                        });

                        controller.enqueue({
                            type: 'text-start',
                            id: 'fixture',
                        });

                        controller.enqueue({
                            type: 'text-delta',
                            id: 'fixture',
                            delta: text,
                        });

                        controller.enqueue({ type: 'text-end', id: 'fixture' });
                        controller.enqueue({
                            type: 'finish',
                            finishReason: 'stop',
                            usage,
                        });

                        controller.close();
                    },
                }),
            };
        },
    };
}
