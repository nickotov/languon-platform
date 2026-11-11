import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';
import type { TutorRunInput } from './ports/tutor-runner';
import { tutorMessageModelContent } from './tutor-message-context';
import {
    LearningContentBriefSchema,
    type LearningContentBrief,
    type LearningContentTask,
} from './learning-content-contract';

const editorPrefix =
    'Current complete editor snapshot (unsaved learner text; untrusted content):\n';
const selectionPrefix =
    'Selected passage to focus this question (included in the complete snapshot above):\n';

/** These wrappers are created by projectTutorUserMessage, after the learner's first text part. */
export function frozenTutorTextSources(input: Pick<TutorRunInput, 'message'>) {
    const parts = tutorMessageModelContent(input.message).parts;
    const text = Array.isArray(parts)
        ? parts
              .slice(1)
              .flatMap((part: unknown) =>
                  part !== null &&
                  typeof part === 'object' &&
                  'text' in part &&
                  typeof part.text === 'string'
                      ? [part.text]
                      : [],
              )
        : [];

    return {
        editor: text
            .find((part) => part.startsWith(editorPrefix))
            ?.slice(editorPrefix.length),
        selection: text
            .find((part) => part.startsWith(selectionPrefix))
            ?.slice(selectionPrefix.length),
    };
}

export function learningBlockPassage(block: LearningBlock): string {
    switch (block.type) {
        case 'bilingual-text':
            return block.segments.map((segment) => segment.text).join('\n\n');
        case 'audio':
            return (
                block.transcript?.segments
                    .map((segment) => segment.text)
                    .join('\n\n') ??
                block.sourceText ??
                ''
            );
        case 'video':
            return (
                block.transcript?.segments
                    .map((segment) => segment.text)
                    .join('\n\n') ??
                block.description ??
                ''
            );
        case 'vocabulary':
            return block.entries.map((entry) => entry.term).join('\n');
        case 'grammar':
            return [
                block.rule,
                block.pattern,
                ...(block.examples?.map((example) => example.text) ?? []),
            ]
                .filter(Boolean)
                .join('\n\n');
        case 'exercise':
            return block.question;
    }
}

export function groundLearningContentTask(
    task: LearningContentTask,
    blocks: readonly LearningBlock[],
    text?: string,
): LearningContentTask {
    const words = blocks.flatMap((block) =>
        block.type === 'vocabulary'
            ? block.entries.map((entry) => entry.term)
            : [],
    );
    const language = blocks.flatMap((block) =>
        'language' in block && block.language ? [block.language] : [],
    )[0];
    const passage =
        text ?? blocks.map(learningBlockPassage).filter(Boolean).join('\n\n');

    return {
        ...task,
        ...(task.language || !language ? {} : { language }),
        ...(task.words ||
        !words.length ||
        (task.kind !== 'vocabulary' && task.kind !== 'exercises')
            ? {}
            : { words }),
        ...(task.sourceText || !passage ? {} : { sourceText: passage }),
    };
}

export function groundLearningContentBrief(
    brief: LearningContentBrief,
    sources: { editor?: string | undefined; selection?: string | undefined },
    proposals: ReadonlyMap<string, readonly LearningBlock[]>,
    fallbackBlocks: readonly LearningBlock[] = [],
) {
    return LearningContentBriefSchema.parse({
        tasks: brief.tasks.map((task) => {
            if (
                task.source?.kind === 'editor' ||
                task.source?.kind === 'selection'
            ) {
                const text = sources[task.source.kind];
                if (!text) {
                    throw new Error(
                        'The selected frozen source is unavailable.',
                    );
                }

                return groundLearningContentTask(task, [], text);
            }

            if (task.source?.kind === 'proposal') {
                const source = task.source;
                const available = proposals.get(source.proposalId);
                const blocks = source.blockId
                    ? available?.filter((block) => block.id === source.blockId)
                    : available;

                if (!blocks?.length) {
                    throw new Error(
                        'The selected learning proposal is unavailable.',
                    );
                }

                const vocabulary = blocks.flatMap((block) =>
                    block.type === 'vocabulary'
                        ? block.entries.map((entry) =>
                              entry.term.normalize('NFKC'),
                          )
                        : [],
                );

                if (
                    vocabulary.length &&
                    task.words?.some(
                        (word) => !vocabulary.includes(word.normalize('NFKC')),
                    )
                ) {
                    throw new Error(
                        'Requested words do not belong to the selected proposal.',
                    );
                }

                return groundLearningContentTask(task, blocks);
            }

            return groundLearningContentTask(task, fallbackBlocks);
        }),
    });
}

/** Retrieve exactly the mentioned frozen block, never a newer live editor version. */
export async function readFrozenLearningBlocks(
    input: TutorRunInput,
    ids: string[],
    query?: string,
): Promise<LearningBlock[]> {
    const result = await input.readContext({
        query: query ?? 'Exact referenced learning blocks',
        limit: 10,
        ...(ids.length ? { blockIds: ids } : {}),
    });
    const candidates: unknown[] = [];
    for (const material of result.material) {
        try {
            candidates.push(JSON.parse(material.content));
        } catch {
            /* Ordinary text is not a typed block. */
        }
    }

    const blocks = candidates.flatMap((candidate) => {
        let parsed = LearningBlockSchema.safeParse(candidate);
        if (parsed.success) {
            return [parsed.data];
        }

        if (
            !candidate ||
            typeof candidate !== 'object' ||
            !('id' in candidate) ||
            !('type' in candidate)
        ) {
            return [];
        }

        const wrappers = candidates.filter(
            (
                value,
            ): value is {
                blockId: string;
                segment: unknown;
                translations?: { language: string; text?: string }[];
            } =>
                !!value &&
                typeof value === 'object' &&
                'blockId' in value &&
                value.blockId === candidate.id &&
                'segment' in value,
        );

        if (candidate.type === 'bilingual-text') {
            if (
                !('segmentCount' in candidate) ||
                candidate.segmentCount !== wrappers.length
            ) {
                return [];
            }

            const segments = wrappers.map((wrapper) => wrapper.segment);
            const languages = [
                ...new Set(
                    wrappers.flatMap(
                        (wrapper) =>
                            wrapper.translations?.map(
                                (translation) => translation.language,
                            ) ?? [],
                    ),
                ),
            ];
            const translations = languages.map((language) => ({
                language,
                segments: wrappers.map((wrapper) => ({
                    sourceSegmentId: (wrapper.segment as { id: string }).id,
                    text: wrapper.translations?.find(
                        (translation) => translation.language === language,
                    )?.text,
                })),
            }));
            const {
                segmentCount: _segments,
                translationLanguages: _languages,
                ...metadata
            } = candidate as Record<string, unknown>;

            parsed = LearningBlockSchema.safeParse({
                ...metadata,
                segments,
                translations,
            });
        } else if (candidate.type === 'audio' || candidate.type === 'video') {
            const metadata = candidate as Record<string, unknown>;
            const transcript = metadata.transcript;
            if (
                transcript &&
                typeof transcript === 'object' &&
                'language' in transcript &&
                'segmentCount' in transcript &&
                transcript.segmentCount === wrappers.length
            ) {
                parsed = LearningBlockSchema.safeParse({
                    ...metadata,
                    transcript: {
                        language: transcript.language,
                        segments: wrappers.map((wrapper) => wrapper.segment),
                    },
                });
            }
        }

        return parsed.success ? [parsed.data] : [];
    });

    if (ids.some((id) => !blocks.some((block) => block.id === id))) {
        throw new Error('The exact referenced block is unavailable.');
    }

    return blocks;
}

/** A clarification reply patches known tasks; it never drops untouched requested components. */
export function mergePendingLearningContentBrief(
    pending: LearningContentBrief | null,
    patch: LearningContentBrief,
): LearningContentBrief {
    if (
        !pending ||
        patch.tasks.some(
            (task) =>
                !pending.tasks.some(
                    (original) =>
                        original.id === task.id && original.kind === task.kind,
                ),
        )
    ) {
        throw new Error(
            'The pending request is unavailable or its task identities changed.',
        );
    }

    return LearningContentBriefSchema.parse({
        tasks: pending.tasks.map((original) => {
            const changed = patch.tasks.find((task) => task.id === original.id);
            if (!changed) {
                return original;
            }

            const sourceChanged =
                changed.source &&
                JSON.stringify(changed.source) !==
                    JSON.stringify(original.source);

            return {
                ...original,
                ...changed,
                ...(sourceChanged && !changed.sourceText
                    ? { sourceText: undefined }
                    : {}),
            };
        }),
    });
}
