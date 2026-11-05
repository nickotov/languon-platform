import { getLocalPrompt } from '@languon/prompts';
import { deserializeLearningContentBrief } from '../../src/modules/conversations/application/learning-content-transport';
import { markdownGrammarProposal } from './contextual-block-proposal-fixture';
import { randomUUID } from 'node:crypto';
import { shoppingVocabularyBatch } from './contextual-shopping-vocabulary-fixture';

function planningSourceCatalog(
    prompt: unknown,
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
                        availableBlocks?: {
                            id: string;
                            type: string;
                            title?: string;
                        }[];
                    };
                };

                if (Array.isArray(input.source?.availableBlocks)) {
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
    if (question.startsWith('Generate vocabulary with top 50 words')) {
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
                        count: 50,
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

        return { kind: 'legacy-copy', sourceBlockIds: [audio[0]!.id] };
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
        return { kind: 'legacy-revision' };
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
                const choice = randomUUID();

                return {
                    taskId: task.id,
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'exercise',
                            format: 'multiple-choice',
                            title: 'Vocabulary choice',
                            question: 'Which French word means work?',
                            referenceAnswer: 'travail',
                            explanation: 'Travail means work.',
                            group: { id: group },
                            choices: [
                                { id: choice, text: 'travail' },
                                { id: randomUUID(), text: 'joie' },
                            ],
                            correctChoiceId: choice,
                        },
                        {
                            id: randomUUID(),
                            type: 'exercise',
                            format: 'fill-in-the-blank',
                            title: 'Vocabulary gap',
                            question: 'Complete the French phrase for joy.',
                            referenceAnswer: 'joie',
                            explanation: 'Joie means joy.',
                            group: { id: group },
                            parts: [
                                { kind: 'text', text: 'La ' },
                                {
                                    kind: 'gap',
                                    id: randomUUID(),
                                    acceptedAnswers: ['joie'],
                                },
                            ],
                        },
                        {
                            id: randomUUID(),
                            type: 'exercise',
                            format: 'free-text',
                            title: 'Vocabulary writing',
                            question:
                                'Write travail and joie in a French sentence.',
                            referenceAnswer: 'Le travail donne de la joie.',
                            explanation:
                                'Both words are used in a complete sentence.',
                            group: { id: group },
                        },
                    ],
                };
            }

            throw new Error('Unexpected fixture task.');
        }),
    };
}
