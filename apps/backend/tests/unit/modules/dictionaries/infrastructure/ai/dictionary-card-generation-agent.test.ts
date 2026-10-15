import { describe, expect, it } from 'vitest';

import { createDictionaryCardGenerationAgent } from '../../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-card-generation-agent';

describe('dictionary card review agent instructions', () => {
    it('receives mandatory noun article correction without calling a model', async () => {
        const agent = createDictionaryCardGenerationAgent({
            model: 'deepseek/deepseek-chat',
        });
        const instructions = await agent.getInstructions();

        expect(instructions).toEqual(expect.any(String));
        expect(instructions).toContain(
            'enabled Source and Translation noun entries',
        );
        expect(instructions).toContain(
            'taf meaning informal work should become le taf',
        );
        expect(instructions).toContain('count nouns and mass nouns');
        expect(instructions).toContain('inactive values');
        expect(instructions).toContain('explicitly accept');
    });
});
