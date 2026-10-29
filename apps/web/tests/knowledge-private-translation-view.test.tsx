import { randomUUID } from 'node:crypto';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';
import { BilingualTextView } from '@/fsd/entities/learning-blocks';
import { knowledgeLearningBlockLabels } from '@/fsd/features/knowledge-notes';
it('renders independently bounded original/private passages without treating their presentation as a publishable block', () => {
    const original: Extract<LearningBlock, { type: 'bilingual-text' }> = {
        id: randomUUID(),
        type: 'bilingual-text',
        language: 'en',
        segments: Array.from({ length: 9 }, () => ({
            id: randomUUID(),
            text: 'O'.repeat(7000),
        })),
        translations: [],
    };
    const presentation = {
        ...original,
        translations: [
            {
                language: 'fr',
                segments: original.segments.map((segment) => ({
                    sourceSegmentId: segment.id,
                    text: 'T'.repeat(3000),
                })),
            },
        ],
    };
    expect(LearningBlockSchema.safeParse(original).success).toBe(true);
    expect(LearningBlockSchema.safeParse(presentation).success).toBe(false);
    render(
        <BilingualTextView
            block={presentation}
            labels={knowledgeLearningBlockLabels('en').view}
        />,
    );
    expect(screen.getAllByText('O'.repeat(7000))).toHaveLength(9);
    fireEvent.click(
        screen.getByRole('button', { name: 'Bilingual', exact: true }),
    );
    expect(screen.getAllByText('T'.repeat(3000))).toHaveLength(9);
    expect(original.translations).toEqual([]);
});
