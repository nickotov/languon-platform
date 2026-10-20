import type { Mapping } from '@tiptap/pm/transform';

export type KnowledgeEditorTarget = {
    id: string;
    from: number;
    to: number;
    selectedText: string;
    changed: boolean;
};

/** Track the original target through edits, while detecting edits to its text. */
export function mapProposalTarget(
    target: KnowledgeEditorTarget,
    mapping: Mapping,
): KnowledgeEditorTarget {
    let { from, to } = target;
    let changed = target.changed;
    for (const stepMap of mapping.maps) {
        stepMap.forEach((oldStart, oldEnd) => {
            if (
                (from === to && oldStart <= from && oldEnd >= to) ||
                (from < to && oldStart < to && oldEnd > from) ||
                (from < to &&
                    oldStart === oldEnd &&
                    oldStart > from &&
                    oldStart < to)
            )
                changed = true;
        });
        const collapsed = from === to;
        from = stepMap.map(from, 1);
        to = stepMap.map(to, collapsed ? 1 : -1);
    }
    return { ...target, from, to, changed };
}
