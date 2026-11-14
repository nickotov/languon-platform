import { describe, expect, it } from 'vitest';
import {
    exerciseActivityCatalog,
    KnowledgeBodySchema,
    WorkbookAttemptEvaluationSchema,
} from '@languon/contracts';
import {
    guideActivities,
    guideKnowledgeBody,
    guideSources,
} from '../src/fsd/pages/workbook-guide/lib/examples';

for (const locale of ['en', 'ru', 'fr', 'es']) {
    describe(`workbook examples (${locale})`, () => {
        it('covers the catalog exactly with valid local provenance and bound answer keys', () => {
            const examples = guideActivities(locale);
            expect(examples.map(({ activity }) => activity.id)).toEqual(
                exerciseActivityCatalog.map(({ id }) => id),
            );

            expect(
                KnowledgeBodySchema.safeParse(guideKnowledgeBody(locale)),
            ).toMatchObject({ success: true });

            for (const {
                activity,
                block,
                sources,
                sampleResponses,
            } of examples) {
                expect(block.semantics?.checking.policy).toBe(
                    activity.checkingPolicy,
                );

                expect(block.format).toBe(activity.format);
                expect(sources).toHaveLength(1);
                for (const response of sampleResponses) {
                    expect(
                        WorkbookAttemptEvaluationSchema.safeParse(
                            response.evaluation,
                        ).success,
                    ).toBe(true);

                    expect(response.answer.length).toBeGreaterThan(0);
                }
            }
        });
    });
}

it('uses stable identifiers and rejects dangling provenance', () => {
    expect(guideKnowledgeBody('en')).toEqual(guideKnowledgeBody('en'));
    const body = guideKnowledgeBody('en');
    body.document.content = body.document.content.filter(
        (node) => node.attrs.block.id !== guideSources[0]!.id,
    );

    expect(KnowledgeBodySchema.safeParse(body).success).toBe(false);
});

it('has curated contrasting choices, correct gaps and explicit missing evidence', () => {
    const examples = guideActivities('en');
    const find = (id: string) =>
        examples.find(({ activity }) => activity.id === id)!.block;

    expect(find('V02').referenceAnswer).toBe('Give something back');
    expect(find('V06').referenceAnswer).toBe('helpful');
    expect(find('R03').referenceAnswer).toBe('Not stated');
    expect(find('R03').explanation).toContain('no information');
    expect(find('G02').referenceAnswer).toBe('is walking');
});

it('keeps illustrative AI responses separate from learner input', () => {
    const examples = guideActivities('en');
    expect(
        examples
            .filter(
                ({ activity }) => activity.checkingPolicy === 'prepared-key',
            )
            .every(({ sampleResponses }) => sampleResponses.length === 0),
    ).toBe(true);

    expect(
        examples
            .find(({ activity }) => activity.id === 'V07')!
            .sampleResponses.map(({ evaluation }) => evaluation.status),
    ).toEqual(['correct', 'partially-correct', 'unable-to-assess']);
});
