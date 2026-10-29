import { describe, expect, it } from 'vitest';
import {
    knowledgeTextAiAdmissionsEnabled,
    textsAiAdmissionsEnabled,
} from '../../../../../src/modules/text-ai/infrastructure/text-ai-composition';

describe('knowledge structured-action rollout isolation', () => {
    const existing =
        'text-detection:v2,text-translation:v3,text-selection-card:v1';
    const production = {
        APP_ENV: 'production',
        TEXTS_AI_ENABLED: 'true',
        DICTIONARY_JOB_API_ENQUEUED_FORMATS: existing,
        DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: existing,
    };
    it('keeps existing Texts available while the new knowledge format is not deployed', () => {
        expect(textsAiAdmissionsEnabled(production)).toBe(true);
        expect(knowledgeTextAiAdmissionsEnabled(production)).toBe(false);
    });
    it('requires both API and workers to accept the new format in production', () => {
        const apiOnly = {
            ...production,
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: `${existing},text-translation:v4`,
        };
        expect(knowledgeTextAiAdmissionsEnabled(apiOnly)).toBe(false);
        expect(
            knowledgeTextAiAdmissionsEnabled({
                ...apiOnly,
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: `${existing},text-translation:v4`,
            }),
        ).toBe(true);
    });
    it('never bypasses the main generation off switch', () => {
        expect(
            knowledgeTextAiAdmissionsEnabled({
                APP_ENV: 'test',
                TEXTS_AI_ENABLED: 'false',
            }),
        ).toBe(false);
        expect(
            knowledgeTextAiAdmissionsEnabled({
                APP_ENV: 'test',
                TEXTS_AI_ENABLED: 'true',
            }),
        ).toBe(true);
    });
});
