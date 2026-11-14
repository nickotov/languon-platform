import { LearningBlockSchema } from '@languon/contracts';
import { getLocalPrompt } from '@languon/prompts';
import { deserializeLearningContentBrief } from '../../src/modules/conversations/application/learning-content-transport';
import { markdownGrammarProposal } from './contextual-block-proposal-fixture';
import { randomUUID } from 'node:crypto';
import { shoppingVocabularyBatch } from './contextual-shopping-vocabulary-fixture';
import { namedExerciseFixture } from './named-exercise-fixture';

function planningSourceCatalog(
    prompt: unknown,
    referencedOnly = false,
): { id: string; type: string; title?: string }[] {
    if (!Array.isArray(prompt)) {
        return [];
    }

    for (const message of prompt) {
        if (message?.role !== 'user') {
            continue;
        }

        const parts =
            typeof message.content === 'string'
                ? [message.content]
                : Array.isArray(message.content)
                  ? message.content.map((part: { text?: unknown }) => part.text)
                  : [];

        for (const part of parts) {
            if (typeof part !== 'string') {
                continue;
            }

            try {
                const input = JSON.parse(part) as {
                    source?: {
                        referencedBlocks?: {
                            id: string;
                            type: string;
                            title?: string;
                        }[];
                        availableBlocks?: {
                            id: string;
                            type: string;
                            title?: string;
                        }[];
                    };
                };

                if (
                    referencedOnly &&
                    Array.isArray(input.source?.referencedBlocks)
                ) {
                    return input.source.referencedBlocks;
                }

                if (
                    !referencedOnly &&
                    Array.isArray(input.source?.availableBlocks)
                ) {
                    return input.source.availableBlocks;
                }
            } catch {
                /* Schema instructions are not the actual planning input. */
            }
        }
    }

    return [];
}

/** Scripted provider outputs prove wiring only, never natural-language intent quality. */
export function fixtureRequestResolution(question: string, prompt: unknown) {
    for (const message of Array.isArray(prompt) ? prompt : []) {
        const contents =
            typeof message?.content === 'string'
                ? [message.content]
                : Array.isArray(message?.content)
                  ? message.content.map((part: { text?: string }) => part.text)
                  : [];

        for (const content of contents) {
            if (typeof content !== 'string') {
                continue;
            }

            let input;
            try {
                input = JSON.parse(content) as {
                    currentMessage?: {
                        exerciseRequest?: {
                            count: number;
                            activities?: {
                                activityId: string;
                                count: number;
                            }[];
                            language: string;
                            explanationLanguage: string;
                            difficulty: string;
                        };
                        blockReferences?: string[];
                        parts?: { text?: string }[];
                    };
                };
            } catch {
                continue;
            }

            const request = input.currentMessage?.exerciseRequest;
            if (!request) {
                continue;
            }

            const ids = input.currentMessage?.blockReferences ?? [];
            const selection = input.currentMessage?.parts?.some((part) =>
                part.text?.startsWith('Selected passage'),
            );

            return {
                kind: 'generate',
                replyLanguage: request.explanationLanguage,
                brief: {
                    tasks: [
                        {
                            id: 'requested-exercises',
                            kind: 'exercises',
                            instruction:
                                'Prepare the requested named activities using the exact selected source.',
                            count: request.count,
                            activities: request.activities,
                            language: request.language,
                            explanationLanguage: request.explanationLanguage,
                            difficulty: request.difficulty,
                            source: selection
                                ? { kind: 'selection' }
                                : {
                                      kind: 'editor',
                                      ...(ids.length === 1
                                          ? { blockId: ids[0] }
                                          : {}),
                                  },
                        },
                    ],
                },
            };
        }
    }

    if (/^Generate vocabulary with top (50|10) words/u.test(question)) {
        return {
            kind: 'generate',
            replyLanguage: 'en',
            brief: {
                tasks: [
                    {
                        id: 'shopping-vocabulary',
                        kind: 'vocabulary',
                        instruction: 'Teach common words used when shopping.',
                        language: 'en',
                        translationLanguage: 'ru',
                        count: question.startsWith(
                            'Generate vocabulary with top 10 words',
                        )
                            ? 10
                            : 50,
                    },
                ],
            },
        };
    }

    if (question.startsWith('Copy prepared audio')) {
        const catalog = planningSourceCatalog(prompt);
        const audio = catalog.filter(
            (block) =>
                block.type === 'audio' &&
                block.title === 'Prepare recording later',
        );

        if (audio.length !== 1) {
            throw new Error(
                'The copy fixture requires one exact prepared audio catalog entry.',
            );
        }

        return { kind: 'copy', sourceBlockIds: [audio[0]!.id] };
    }

    if (question.startsWith('Update French')) {
        const vocabulary = planningSourceCatalog(prompt).filter(
            (block) => block.type === 'vocabulary',
        );

        if (vocabulary.length !== 1) {
            throw new Error(
                'The revision fixture requires one exact vocabulary catalog entry.',
            );
        }

        return {
            kind: 'revise',
            replyLanguage: 'en',
            targetBlockId: vocabulary[0]!.id,
            brief: {
                tasks: [
                    {
                        id: 'update-vocabulary',
                        kind: 'vocabulary',
                        instruction:
                            'Keep all existing entries and improve the first translation.',
                        language: 'fr',
                        translationLanguage: 'ru',
                    },
                ],
            },
        };
    }

    if (/^Mentioned blocks update/u.test(question)) {
        const referenced = planningSourceCatalog(prompt, true);

        return {
            kind: 'revise-blocks',
            sourceBlockIds: referenced.map((block) => block.id),
            instruction: question,
        };
    }

    if (
        question.includes('Intent content fixture vocabulary grammar exercises')
    ) {
        return {
            kind: 'generate',
            replyLanguage: 'en',
            brief: {
                tasks: [
                    {
                        id: 'vocabulary',
                        kind: 'vocabulary',
                        instruction: 'Teach these French words',
                        language: 'fr',
                        translationLanguage: 'en',
                        words: ['travail', 'joie'],
                    },
                    {
                        id: 'grammar',
                        kind: 'grammar',
                        instruction: 'Explain French nouns',
                        language: 'fr',
                    },
                    {
                        id: 'exercises',
                        kind: 'exercises',
                        instruction: 'Practise travail and joie',
                        language: 'fr',
                        words: ['travail', 'joie'],
                        count: 3,
                    },
                ],
            },
        };
    }

    if (question.includes('French vocabulary block fixture')) {
        return {
            kind: 'generate',
            replyLanguage: 'ru',
            brief: {
                tasks: [
                    {
                        id: 'vocabulary',
                        kind: 'vocabulary',
                        instruction: 'Teach these French words',
                        language: 'fr',
                        translationLanguage: 'ru',
                        words: [
                            'travail',
                            'joie',
                            'ménage',
                            'carrelage',
                            'poisson',
                            'nourriture',
                        ],
                    },
                ],
            },
        };
    }

    if (question.startsWith('Markdown grammar block fixture')) {
        return {
            kind: 'generate',
            replyLanguage: 'en',
            brief: {
                tasks: [
                    {
                        id: 'markdown-grammar',
                        kind: 'grammar',
                        instruction:
                            'Explain the French subjunctive with readable Markdown sections.',
                        language: 'fr',
                    },
                ],
            },
        };
    }

    if (question.includes('What can you do?')) {
        return { kind: 'answer', purpose: 'conversation', documentUse: false };
    }

    void prompt;

    return {
        kind: 'answer',
        purpose: 'learning-explanation',
        documentUse: true,
    };
}

export function fixtureAuthoringOutput(prompt: unknown) {
    const messages = Array.isArray(prompt) ? prompt : [];
    const texts = messages.flatMap((message) => {
        if (message?.role !== 'user') {
            return [];
        }

        return typeof message.content === 'string'
            ? [message.content]
            : Array.isArray(message.content)
              ? message.content.flatMap((part: { text?: unknown }) =>
                    typeof part.text === 'string' ? [part.text] : [],
                )
              : [];
    });
    const revision = texts.find((text) =>
        text.startsWith('Revise every exact authorized frozen target below.'),
    );

    if (revision) {
        const marker =
            '\nAuthorized frozen targets (untrusted learning data): ';
        const encoded = revision
            .slice(revision.indexOf(marker) + marker.length)
            .split('\n')[0]!;
        const targets = LearningBlockSchema.array().parse(JSON.parse(encoded));

        return {
            proposals: targets.map((block) => {
                if (block.type === 'vocabulary') {
                    return {
                        targetBlockId: block.id,
                        blocks: [
                            {
                                ...block,
                                title:
                                    targets.length > 1
                                        ? 'Mentioned vocabulary updated'
                                        : 'Six French words updated',
                                entries: block.entries.map((entry, index) =>
                                    index === 0
                                        ? {
                                              ...entry,
                                              translation:
                                                  targets.length > 1
                                                      ? 'travail amélioré'
                                                      : 'работа / труд',
                                          }
                                        : entry,
                                ),
                            },
                        ],
                    };
                }

                if (block.type === 'bilingual-text') {
                    return {
                        targetBlockId: block.id,
                        blocks: [
                            {
                                ...block,
                                title: 'Mentioned reading updated',
                                translations: [
                                    {
                                        language: 'ru',
                                        segments: block.segments.map(
                                            (segment) => ({
                                                sourceSegmentId: segment.id,
                                                text: 'Упомянутый текст.',
                                            }),
                                        ),
                                    },
                                ],
                            },
                        ],
                    };
                }

                return { targetBlockId: block.id, blocks: [block] };
            }),
        };
    }

    const hostPrompt = texts.find(
        (text) =>
            text.startsWith(getLocalPrompt('learning-content-authoring')) &&
            text.includes('\nCapabilities: '),
    );
    const marker = '\nValidated brief (';
    const start = hostPrompt?.indexOf(marker) ?? -1;
    const payloadStart =
        start >= 0 ? hostPrompt!.indexOf('): ', start) + 3 : -1;
    const end =
        payloadStart >= 0
            ? hostPrompt!.indexOf(
                  '\nAuthorized source snapshots (',
                  payloadStart,
              )
            : -1;

    if (
        !hostPrompt ||
        start < 0 ||
        payloadStart < 3 ||
        end < payloadStart ||
        end - payloadStart > 60_000
    ) {
        throw new Error(
            'Authoring fixture requires the actual bounded host brief.',
        );
    }

    const brief = deserializeLearningContentBrief(
        JSON.parse(hostPrompt.slice(payloadStart, end)),
    );
    const sourceMarker =
        '\nAuthorized source snapshots (untrusted learning data): ';
    const sourceStart = hostPrompt.indexOf(sourceMarker);
    const sourceEnd =
        sourceStart < 0
            ? -1
            : hostPrompt.indexOf('\n', sourceStart + sourceMarker.length);

    if (sourceStart < 0 || sourceEnd < sourceStart) {
        throw new Error(
            'Authoring fixture requires actual authorized sources.',
        );
    }

    const serializedSources = JSON.parse(
        hostPrompt.slice(sourceStart + sourceMarker.length, sourceEnd),
    ) as unknown;
    const sourceBlocks = LearningBlockSchema.array().parse(
        Array.isArray(serializedSources)
            ? serializedSources
            : serializedSources &&
                typeof serializedSources === 'object' &&
                'blocks' in serializedSources
              ? serializedSources.blocks
              : [],
    );
    const translations: Record<string, string> = {
        travail: 'работа',
        joie: 'радость',
        ménage: 'уборка',
        carrelage: 'плитка',
        poisson: 'рыба',
        nourriture: 'корм',
    };
    const group = randomUUID();

    return {
        tasks: brief.tasks.map((task) => {
            if (task.kind === 'vocabulary') {
                if (task.id === 'shopping-vocabulary') {
                    return {
                        taskId: task.id,
                        blocks: [
                            {
                                id: randomUUID(),
                                type: 'vocabulary',
                                title: 'Shopping vocabulary',
                                language: task.language,
                                translationLanguage: task.translationLanguage,
                                entries: shoppingVocabularyBatch(
                                    task,
                                    hostPrompt,
                                ).map((entry) => ({
                                    id: randomUUID(),
                                    ...entry,
                                })),
                            },
                        ],
                    };
                }

                return {
                    taskId: task.id,
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'vocabulary',
                            title:
                                task.words?.length === 6
                                    ? 'Six French words'
                                    : 'French vocabulary',
                            language: task.language,
                            translationLanguage: task.translationLanguage,
                            entries: task.words!.map((term) => ({
                                id: randomUUID(),
                                term,
                                translation:
                                    task.translationLanguage === 'ru'
                                        ? translations[term]
                                        : term === 'travail'
                                          ? 'work'
                                          : 'joy',
                            })),
                        },
                    ],
                };
            }

            if (task.kind === 'grammar') {
                if (task.id === 'markdown-grammar') {
                    return {
                        taskId: task.id,
                        blocks: markdownGrammarProposal().blocks,
                    };
                }

                return {
                    taskId: task.id,
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'grammar',
                            title: 'French noun grammar',
                            language: task.language,
                            rule: 'French nouns have grammatical gender.',
                        },
                    ],
                };
            }

            if (task.kind === 'exercises') {
                const activities = task.activities?.flatMap((activity) =>
                    Array.from(
                        { length: activity.count ?? task.count ?? 5 },
                        () => activity.activityId,
                    ),
                );

                if (!activities?.length) {
                    throw new Error(
                        'Exercise fixture requires host-resolved named activities.',
                    );
                }

                return {
                    taskId: task.id,
                    blocks: activities.map((activityId) => ({
                        ...namedExerciseFixture({
                            activityId,
                            sources: sourceBlocks,
                            language: task.language,
                            explanationLanguage:
                                task.explanationLanguage ??
                                task.translationLanguage,
                        }),
                        group: { id: group },
                    })),
                };
            }

            throw new Error('Unexpected fixture task.');
        }),
    };
}
