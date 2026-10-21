import { describe, it, expect } from 'vitest';
import { textsAiAdmissionsEnabled } from '../../../../../src/modules/text-ai/infrastructure/text-ai-composition';
describe('Texts rollout admissions', () => {
    it('defaults closed and allows explicit local deterministic development', () => {
        expect(textsAiAdmissionsEnabled({})).toBe(false);
        expect(
            textsAiAdmissionsEnabled({
                TEXTS_AI_ENABLED: 'true',
                APP_ENV: 'development',
            }),
        ).toBe(true);
    });
    it.each(['staging', 'production'])(
        'requires every API and worker format in %s',
        (APP_ENV) => {
            const formats =
                'text-detection:v1,text-detection:v2,text-translation:v1,text-translation:v2,text-translation:v3,text-selection-card:v1';
            const environment = {
                APP_ENV,
                TEXTS_AI_ENABLED: 'true',
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: formats,
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: formats,
            };
            expect(textsAiAdmissionsEnabled(environment)).toBe(true);
            const legacyFormats =
                'text-detection:v1,text-translation:v1,text-selection-card:v1';
            expect(
                textsAiAdmissionsEnabled({
                    ...environment,
                    DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: legacyFormats,
                }),
            ).toBe(false);
            expect(
                textsAiAdmissionsEnabled({
                    ...environment,
                    DICTIONARY_JOB_API_ENQUEUED_FORMATS: legacyFormats,
                }),
            ).toBe(false);
            expect(
                textsAiAdmissionsEnabled({
                    ...environment,
                    TEXTS_AI_ENABLED: 'false',
                }),
            ).toBe(false);
            expect(
                textsAiAdmissionsEnabled({
                    ...environment,
                    DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS:
                        'text-translation:v1',
                }),
            ).toBe(false);
            expect(
                textsAiAdmissionsEnabled({
                    ...environment,
                    DICTIONARY_JOB_API_ENQUEUED_FORMATS: '',
                }),
            ).toBe(false);
        },
    );
});
