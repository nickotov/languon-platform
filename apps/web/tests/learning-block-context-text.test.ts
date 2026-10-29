import { expect, it } from 'vitest';
import { LearningBlockSchema } from '@languon/contracts';
import { learningBlockPlainText } from '../src/fsd/features/knowledge-notes/lib/learning-block-text';

const id = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
it('includes authored video descriptions and exercise hints in the immutable editor text without presentation identities', () => {
    const video = LearningBlockSchema.parse({
        id,
        type: 'video',
        source: { kind: 'youtube', videoId: 'dQw4w9WgXcQ' },
        description: 'Author description: a train arrives.',
    });
    const exercise = LearningBlockSchema.parse({
        id,
        type: 'exercise',
        format: 'free-text',
        question: 'What arrives?',
        referenceAnswer: 'A train',
        explanation: 'The author describes a train.',
        hint: 'Look at the station.',
        group: { id: groupId, title: 'Listening practice', parentBlockId: id },
    });
    expect(learningBlockPlainText(video)).toContain(
        'Author description: a train arrives.',
    );
    const text = learningBlockPlainText(exercise);
    expect(text).toContain('Listening practice');
    expect(text).toContain('Look at the station.');
    expect(text).not.toContain(groupId);
    expect(text).not.toContain(id);
});
