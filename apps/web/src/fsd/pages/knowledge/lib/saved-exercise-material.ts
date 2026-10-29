import type { LearningBlock } from '@languon/contracts';

function canonical(value: unknown) {
    return JSON.stringify(value, (_key, child: unknown) => {
        if (!child || typeof child !== 'object' || Array.isArray(child))
            return child;
        return Object.fromEntries(
            Object.entries(child).sort(([left], [right]) =>
                left.localeCompare(right),
            ),
        );
    });
}

function material(block: Extract<LearningBlock, { type: 'exercise' }>) {
    const {
        title: _title,
        explanation: _explanation,
        hint: _hint,
        group: _group,
        ...content
    } = block;
    return content;
}

/** Conservative client eligibility only; the server remains the revision authority. */
export function hasSavedExerciseMaterial(
    block: LearningBlock,
    working: LearningBlock[],
    saved: LearningBlock[],
) {
    if (block.type !== 'exercise') return false;
    const original = saved.find((item) => item.id === block.id);
    if (
        original?.type !== 'exercise' ||
        canonical(material(block)) !== canonical(material(original))
    )
        return false;
    if (!block.source) return true;
    const source = working.find((item) => item.id === block.source?.blockId);
    const savedSource = saved.find(
        (item) => item.id === original.source?.blockId,
    );
    if (!source || !savedSource) return false;
    const { title: _title, ...content } = source;
    const { title: _savedTitle, ...savedContent } = savedSource;
    return canonical(content) === canonical(savedContent);
}
