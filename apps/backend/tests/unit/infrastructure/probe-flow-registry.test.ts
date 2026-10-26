import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TextAiFlowIdSchema } from '@languon/contracts';
import { getLocalPrompt } from '@languon/prompts';
import { createTextAiSyntheticFlows } from '../../../src/infrastructure/text-ai/probe-flow-registry';
import { sentenceCheckProviderSchema } from '../../../src/modules/learning/infrastructure/ai/sentence-provider-envelope';
import { DictionaryCardAuthoringModelOutputSchema } from '../../../src/modules/dictionaries/infrastructure/ai/card-authoring-proposal-generators';

function fingerprint() {
    return createHash('sha256')
        .update(
            JSON.stringify(
                Object.entries(createTextAiSyntheticFlows()).map(
                    ([id, flow]) => ({
                        id,
                        validationRevision: flow.validationRevision,
                        instructions: flow.instructions,
                        input: flow.input,
                        schema: flow.schema
                            ? z.toJSONSchema(flow.schema)
                            : null,
                    }),
                ),
            ),
        )
        .digest('hex');
}
describe('synthetic production flow registry', () => {
    it('covers every registered flow using deterministic synthetic content', () => {
        const flows = createTextAiSyntheticFlows();
        expect(Object.keys(flows).sort()).toEqual(
            [...TextAiFlowIdSchema.options].sort(),
        );
        for (const [id, flow] of Object.entries(flows)) {
            expect(flow.instructions.length).toBeGreaterThan(50);
            expect(flow.input.length).toBeGreaterThan(10);
            expect(flow.validate({})).toBe(false);
            if (id !== 'conversation')
                expect(() => JSON.parse(flow.input)).not.toThrow();
            expect(flow.input).not.toContain('test@testmail.test');
        }
        expect(flows.conversation.validate('Synthetic answer.')).toBe(true);
    });
    it('shares exact production prompt/schema construction rather than a generic OK contract', () => {
        const flows = createTextAiSyntheticFlows();
        expect(flows['sentence-check'].instructions).toBe(
            getLocalPrompt('sentence-check-agent'),
        );
        expect(z.toJSONSchema(flows['sentence-check'].schema!)).toEqual(
            z.toJSONSchema(sentenceCheckProviderSchema(['target-1'])),
        );
        expect(flows['card-authoring'].schema).toBe(
            DictionaryCardAuthoringModelOutputSchema,
        );
        expect(flows['text-selection-card'].schema).toBe(
            DictionaryCardAuthoringModelOutputSchema,
        );
        expect(flows['document-terms'].instructions).toBe(
            flows['pasted-terms'].instructions,
        );
    });
    it('has a stable contract hash until the owned prompt/schema/fixture changes', () => {
        expect(fingerprint()).toMatch(/^[a-f0-9]{64}$/);
        expect(fingerprint()).toBe(fingerprint());
    });
    it('validates translated sentence identity, not just arbitrary valid JSON', () => {
        const flow = createTextAiSyntheticFlows()['text-translation'];
        expect(
            flow.validate({
                translation: [
                    {
                        pairId: '00000000-0000-4000-8000-000000000003',
                        text: 'Leo un libro.',
                    },
                ],
            }),
        ).toBe(true);
        expect(
            flow.validate({
                translation: [
                    {
                        pairId: '00000000-0000-4000-8000-000000000004',
                        text: 'Leo un libro.',
                    },
                ],
            }),
        ).toBe(false);
    });
});
