import type {
    GenerationRunPreview,
    GenerationRunSummary,
    KnowledgeBody,
    KnowledgeNode,
} from '@languon/contracts';

/** Compose only validated fragments; placeholders never become document content. */
export function preparedLessonBody(
    run: GenerationRunSummary,
    preview: GenerationRunPreview,
    pendingLabel: string,
): KnowledgeBody {
    const parts = new Map(preview.parts.map((part) => [part.taskId, part]));
    // The summary projects plan.outputOrder, including tasks still without content.
    // Preview parts alone cannot place pending sections between prepared ones.
    const content: KnowledgeNode[] = run.tasks.flatMap((task) => {
        const part = parts.get(task.id);
        const heading: KnowledgeNode = {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: task.label }],
        };
        const pending: KnowledgeNode = {
            type: 'paragraph',
            content: [{ type: 'text', text: pendingLabel }],
        };

        return [
            heading,
            ...(part?.body.document.content ?? []),
            ...(!part || !part.complete ? [pending] : []),
        ];
    });

    return { schemaVersion: 2, document: { type: 'doc', content } };
}
