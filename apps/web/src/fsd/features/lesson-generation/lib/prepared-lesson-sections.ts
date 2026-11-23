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

    return run.tasks.map((task) => {
        const part = parts.get(task.id);
        const local = new Set(
            part ? blocks(part.body).map((block) => block.id) : [],
        );
        const dependencies = [...available.values()].filter(
            (block) => !local.has(block.id),
        );

        return { task, part, dependencies };
    });
}
