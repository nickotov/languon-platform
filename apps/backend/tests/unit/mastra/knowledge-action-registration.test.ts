import { describe, expect, it } from 'vitest';
import { createCanonicalMastra } from '../../../src/mastra/composition';

describe('job-bound knowledge action agent registration', () => {
    it('registers field checking and exercise evaluation with the authorized Texts composition', () => {
        const runtime = createCanonicalMastra({
            textsAi: { model: 'deepseek/deepseek-flash' },
        });
        expect(Object.keys(runtime.listAgents())).toEqual(
            expect.arrayContaining([
                'textTranslationAgent',
                'textDetectionAgent',
                'knowledgeBlockFieldAgent',
                'knowledgeExerciseEvaluationAgent',
            ]),
        );
    });
    it('does not expose job-bound learner agents in default unauthenticated Studio', () => {
        expect(Object.keys(createCanonicalMastra().listAgents())).not.toEqual(
            expect.arrayContaining(['knowledgeBlockFieldAgent']),
        );
        expect(Object.keys(createCanonicalMastra().listAgents())).not.toEqual(
            expect.arrayContaining(['knowledgeExerciseEvaluationAgent']),
        );
    });
});
