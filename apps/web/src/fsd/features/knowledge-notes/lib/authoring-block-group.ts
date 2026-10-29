import type { LearningBlock } from '@languon/contracts';
import { adjacentExerciseGroup } from './adjacent-exercise-group';
import {
    joinsPreviousBlock,
    type PositionedBlock,
} from './positioned-learning-blocks';

export function isMediaQuestion(
    block: LearningBlock,
    parentId: string,
): boolean {
    return (
        block.type === 'exercise' &&
        (block.group?.parentBlockId === parentId ||
            block.source?.blockId === parentId)
    );
}

/** Media and its uninterrupted following question nodes are one authoring surface. */
export function authoringBlockGroup(
    items: PositionedBlock[],
    id: string,
): PositionedBlock[] {
    const index = items.findIndex((item) => item.block.id === id);
    const current = items[index];
    if (!current) return [];
    let parentIndex = index;
    if (current.block.type === 'exercise') {
        const parentId =
            current.block.group?.parentBlockId ?? current.block.source?.blockId;
        if (parentId) {
            let scan = index;
            while (
                scan > 0 &&
                isMediaQuestion(items[scan]!.block, parentId) &&
                joinsPreviousBlock(items[scan - 1]!, items[scan]!)
            ) {
                scan--;
                if (items[scan]!.block.id === parentId) {
                    parentIndex = scan;
                    break;
                }
            }
        }
    }
    const parent = items[parentIndex]!;
    if (parent.block.type !== 'audio' && parent.block.type !== 'video')
        return adjacentExerciseGroup(items, id);
    let end = parentIndex;
    while (
        end + 1 < items.length &&
        isMediaQuestion(items[end + 1]!.block, parent.block.id) &&
        joinsPreviousBlock(items[end]!, items[end + 1]!)
    )
        end++;
    return items.slice(parentIndex, end + 1);
}
