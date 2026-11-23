import type {
    GenerationRunPreview,
    GenerationRunSummary,
    KnowledgeBody,
} from '@languon/contracts';

function blocks(body: KnowledgeBody) {
    return (
        body.document.content?.flatMap((node) =>
            node.type === 'learningBlock' && node.attrs?.block
                ? [node.attrs.block]
                : [],
        ) ?? []
    );
}

/** Each visible fragment can reference sources in another prepared task. */
export function preparedLessonSections(
    run: GenerationRunSummary,
    preview: GenerationRunPreview,
) {
    const parts = new Map(preview.parts.map((part) => [part.taskId, part]));
    const available = new Map(
        [
            ...(preview.dependencies ?? []),
            ...preview.parts.flatMap((part) => blocks(part.body)),
        ].map((block) => [block.id, block]),
    );

    const sections = run.tasks.map((task) => {
        const part = parts.get(task.id);
        const local = new Set(
            part ? blocks(part.body).map((block) => block.id) : [],
        );
        const dependencies = [...available.values()].filter(
            (block) => !local.has(block.id),
        );

        return { task, part, dependencies };
    });

    // A contiguous recording and its questions use a single document player in both previews.
    const grouped: typeof sections = [];
    for (const section of sections) {
        const previous = grouped.at(-1);
        const part = section.part;
        const parent = previous?.part;
        const audio =
            previous?.task.kind === 'audio' && parent
                ? blocks(parent.body).find((block) => block.type === 'audio')
                : undefined;
        const questions = part && blocks(part.body);
        if (
            audio &&
            parent &&
            previous &&
            part &&
            questions?.length &&
            questions.every(
                (block) =>
                    block.type === 'exercise' &&
                    block.source?.blockId === audio.id &&
                    block.semantics?.sources.some(
                        (source) => source.kind === 'audio',
                    ),
            )
        ) {
            const content = [
                ...(parent.body.document.content ?? []),
                ...(part.body.document.content ?? []),
            ];

            previous.part = {
                ...parent,
                complete: parent.complete && part.complete,
                body: {
                    ...parent.body,
                    document: { ...parent.body.document, content },
                },
            };

            const local = new Set(
                blocks(previous.part.body).map((block) => block.id),
            );

            previous.dependencies = [...available.values()].filter(
                (block) => !local.has(block.id),
            );
        } else {
            grouped.push(section);
        }
    }

    return grouped;
}
