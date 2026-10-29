import {
    joinsPreviousBlock,
    type PositionedBlock,
} from './positioned-learning-blocks';

/** Only neighboring questions separated by empty prose at most form one visual/editing set. */
export function adjacentExerciseGroup(
    items: PositionedBlock[],
    id: string,
): PositionedBlock[] {
    const index = items.findIndex((item) => item.block.id === id);
    const current = items[index];
    if (!current || current.block.type !== 'exercise' || !current.block.group)
        return current ? [current] : [];
    const groupId = current.block.group.id;
    function same(item: PositionedBlock | undefined) {
        return (
            item?.block.type === 'exercise' && item.block.group?.id === groupId
        );
    }
    let first = index;
    let last = index;
    while (
        first > 0 &&
        same(items[first - 1]) &&
        joinsPreviousBlock(items[first - 1]!, items[first]!)
    )
        first--;
    while (
        last + 1 < items.length &&
        same(items[last + 1]) &&
        joinsPreviousBlock(items[last]!, items[last + 1]!)
    )
        last++;
    return items.slice(first, last + 1);
}
