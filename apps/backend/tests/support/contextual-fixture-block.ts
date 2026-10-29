import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';

/** Read only the real SDK prompt/tool projection, including split transcript rows. */
export function contextualFixtureBlock(
    prompt: unknown,
    kind: LearningBlock['type'],
    accept: (block: LearningBlock) => boolean = () => true,
): LearningBlock | undefined {
    const objects: Record<string, unknown>[] = [];
    let visited = 0;
    function visit(value: unknown, depth: number) {
        if (++visited > 5000 || depth > 18) return;
        if (typeof value === 'string') {
            try {
                visit(JSON.parse(value), depth + 1);
            } catch {
                /* Plain prose. */
            }
            return;
        }
        if (!value || typeof value !== 'object') return;
        objects.push(value as Record<string, unknown>);
        for (const child of Object.values(value)) visit(child, depth + 1);
    }
    if (Array.isArray(prompt))
        for (const message of prompt) {
            if (
                !message ||
                typeof message !== 'object' ||
                message.role !== 'tool' ||
                !Array.isArray(message.content)
            )
                continue;
            for (const result of message.content)
                if (
                    result &&
                    typeof result === 'object' &&
                    result.toolName === 'read_source_context'
                )
                    visit(result.output, 0);
        }
    for (const candidate of objects) {
        let block = LearningBlockSchema.safeParse(candidate);
        if (
            !block.success &&
            candidate.type === 'audio' &&
            candidate.transcript &&
            typeof candidate.transcript === 'object'
        ) {
            const transcript = candidate.transcript as Record<string, unknown>;
            const segments = objects
                .filter(
                    (item) =>
                        item.blockId === candidate.id &&
                        item.segment &&
                        typeof item.segment === 'object',
                )
                .map((item) => item.segment);
            const unique = [
                ...new Map(
                    segments.map((segment) => [
                        (segment as { id?: unknown }).id,
                        segment,
                    ]),
                ).values(),
            ];
            // Never invent or silently drop an omitted passage from the tool projection.
            if (
                Number.isSafeInteger(transcript.segmentCount) &&
                transcript.segmentCount === unique.length &&
                unique.length > 0
            )
                block = LearningBlockSchema.safeParse({
                    ...candidate,
                    transcript: {
                        language: transcript.language,
                        segments: unique,
                    },
                });
        }
        if (block.success && block.data.type === kind && accept(block.data))
            return block.data;
    }
}
