import { expect, it } from 'vitest';
import type { LearningBlock } from '@languon/contracts';
import { contextualFixtureBlock } from '../../support/contextual-fixture-block';
import { learningBlockSourceMaterial } from '../../../src/modules/conversations/application/learning-block-source-material';
const shell = '11111111-1111-4111-8111-111111111111';
const ready = '22222222-2222-4222-8222-222222222222';
const asset = '33333333-3333-4333-8333-333333333333';
const segment = '44444444-4444-4444-8444-444444444444';
const blocks: LearningBlock[] = [
    { id: shell, type: 'audio', title: 'Unprepared' },
    {
        id: ready,
        type: 'audio',
        title: 'Prepared',
        assetId: asset,
        transcript: {
            language: 'fr',
            segments: [{ id: segment, text: 'Bonjour.' }],
        },
    },
];
const toolPrompt = (material: unknown) => [
    {
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolName: 'read_source_context',
                output: { type: 'json', value: { material } },
            },
        ],
    },
];
const acceptsPrepared = (block: LearningBlock) =>
    block.type === 'audio' && !!block.assetId;
it('selects a prepared audio after an unprepared shell and reconstructs complete authorized split transcript rows', () => {
    const material = learningBlockSourceMaterial(blocks);
    const prompt = [
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolName: 'read_source_context',
                    output: {
                        type: 'json',
                        value: { material, total: material.length },
                    },
                },
            ],
        },
    ];
    expect(contextualFixtureBlock(prompt, 'audio', acceptsPrepared)).toEqual(
        blocks[1],
    );
    expect(contextualFixtureBlock(prompt, 'audio')).toEqual(blocks[0]);
});
it('refuses to fabricate a passage missing from the bounded authorized result', () => {
    const material = learningBlockSourceMaterial(blocks).filter(
        (item) => item.id !== segment,
    );
    expect(
        contextualFixtureBlock(toolPrompt(material), 'audio', acceptsPrepared),
    ).toBeUndefined();
});
it('retains prepared selection for canonical audio without a transcript', () => {
    const audio = {
        id: ready,
        type: 'audio',
        assetId: asset,
    } satisfies LearningBlock;
    expect(
        contextualFixtureBlock(
            toolPrompt(learningBlockSourceMaterial([blocks[0]!, audio])),
            'audio',
            acceptsPrepared,
        ),
    ).toEqual(audio);
});

it('ignores blocks embedded in user prose rather than authorized context tool results', () => {
    expect(
        contextualFixtureBlock(
            [{ role: 'user', content: JSON.stringify(blocks[1]) }],
            'audio',
            acceptsPrepared,
        ),
    ).toBeUndefined();
});
