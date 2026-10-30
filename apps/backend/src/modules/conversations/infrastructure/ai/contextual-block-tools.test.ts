import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createLearningBlockProposalTool } from './contextual-block-tools';

const block = {
    id: randomUUID(),
    type: 'grammar' as const,
    language: 'fr',
    rule: 'Prepared rule.',
};
it('supports several distinct explicit targets while deduplicating repeated in-flight tool calls', async () => {
    const create = vi.fn(async () => ({ id: randomUUID() }));
    const tool = createLearningBlockProposalTool({
        canProposeBlocks: true,
        signal: new AbortController().signal,
        onBlockProposal: create,
    });
    const input = { blocks: [block], targetBlockId: block.id };
    const results = await Promise.all([
        tool.execute!(input, {} as never),
        tool.execute!(input, {} as never),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(create).toHaveBeenCalledOnce();
    await tool.execute!(
        { blocks: [block], targetBlockId: randomUUID() },
        {} as never,
    );
    expect(create).toHaveBeenCalledTimes(2);
});
it('bounds proposals across parallel calls and retains shared-reader denial', async () => {
    const create = vi.fn(async () => ({ id: randomUUID() }));
    const tool = createLearningBlockProposalTool({
        canProposeBlocks: true,
        signal: new AbortController().signal,
        onBlockProposal: create,
    });
    const results = await Promise.allSettled(
        Array.from({ length: 9 }, () =>
            tool.execute!(
                { blocks: [block], targetBlockId: randomUUID() },
                {} as never,
            ),
        ),
    );
    expect(
        results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(8);
    expect(create).toHaveBeenCalledTimes(8);
    const reader = createLearningBlockProposalTool({
        canProposeBlocks: true,
        readOnlySource: true,
        signal: new AbortController().signal,
        onBlockProposal: create,
    });
    await expect(
        reader.execute!({ blocks: [block] }, {} as never),
    ).rejects.toThrow('does not authorize');
    expect(create).toHaveBeenCalledTimes(8);
});
