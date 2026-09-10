import { describe, expect, it, vi } from 'vitest';

import { createDictionaryWorkerComposition } from '../../../../../src/modules/dictionaries/infrastructure/dictionary-worker-composition';
import { dictionaryCardAuthoringGenerationFormat } from '../../../../../src/modules/dictionaries/domain/card-authoring';

const base = {
    clock: { now: () => new Date('2026-08-26T12:00:00.000Z') },
    database: {} as never,
    ids: { generate: vi.fn(() => '00000000-0000-4000-8000-000000000001') },
    pastedTermsProvider: { generate: vi.fn() },
    provider: { generate: vi.fn() },
    supportedFormats: [dictionaryCardAuthoringGenerationFormat],
};

describe('dictionary worker composition', () => {
    it('requires the card-authoring provider whenever the format is processable', () => {
        expect(() => createDictionaryWorkerComposition(base)).toThrow(
            /Card-authoring provider is required/,
        );
    });

    it('composes the card-authoring worker when its dedicated provider is available', () => {
        expect(
            createDictionaryWorkerComposition({
                ...base,
                cardAuthoringProvider: {
                    generate: vi.fn(),
                    readiness: vi.fn(async () => undefined),
                },
            }).service,
        ).toBeDefined();
    });
});
