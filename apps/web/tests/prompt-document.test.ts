import { describe, it, expect } from 'vitest';
import {
    promptDocument,
    serializePrompt,
} from '../src/fsd/widgets/contextual-assistant/lib/prompt-document';

describe('typed inline prompt serialization', () => {
    it('retains exact UTF16 positions around emoji and multiline text', () => {
        const content = '🙂 Generate Choose meaning\nusing Library';
        const mentions = [
            {
                kind: 'exercise' as const,
                activityId: 'V02' as const,
                catalogVersion: 1 as const,
                start: 12,
                end: 26,
            },
            {
                kind: 'block' as const,
                blockId: '00000000-0000-4000-8000-000000000001',
                start: 33,
                end: 40,
            },
        ];

        expect(serializePrompt(promptDocument(content, mentions))).toEqual({
            content,
            promptMentions: mentions,
        });
    });

    it('shifts metadata after trimming only the submitted projection', () => {
        const document = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: '  ' },
                        {
                            type: 'promptMention',
                            attrs: {
                                kind: 'exercise',
                                activityId: 'V02',
                                label: 'Choose meaning',
                            },
                        },
                        { type: 'text', text: '  ' },
                    ],
                },
            ],
        };

        expect(serializePrompt(document)).toEqual({
            content: 'Choose meaning',
            promptMentions: [
                {
                    kind: 'exercise',
                    activityId: 'V02',
                    catalogVersion: 1,
                    start: 0,
                    end: 14,
                },
            ],
        });
    });

    it('never interprets pasted labels as references', () => {
        const content = 'Generate [V02 · Choose meaning] for [Library]';
        expect(serializePrompt(promptDocument(content, []))).toEqual({
            content,
            promptMentions: [],
        });
    });
});
