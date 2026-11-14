import { describe, expect, it } from 'vitest';
import {
    captureBlockReferences,
    assertReferencedProposalTarget,
    prepareReferencedTutorMessage,
} from './conversation-block-references';
import { learningBlockSourceMaterial } from './learning-block-source-material';
import { projectConversationSource } from './conversation-source-context';
import {
    assertTutorCurrentMessageFits,
    currentTutorMessageByteLimit,
    projectTutorUserMessage,
    tutorCurrentMessageBytes,
} from './tutor-message-context';
import type { ConversationSourceSnapshot } from '../domain/conversation';
import type {
    ExerciseGenerationRequest,
    SubmitConversationTurnRequest,
} from '@languon/contracts';

const id = '01900000-0000-4000-8000-000000000001';
const foreign = '01900000-0000-4000-8000-000000000002';
const grammar = {
    id,
    type: 'grammar' as const,
    title: 'Prepared rule',
    language: 'fr',
    rule: 'Use **structured** explanations.',
};

function snapshot(): ConversationSourceSnapshot {
    return {
        title: 'Note',
        description: null,
        studiedLanguage: 'fr',
        version: '1',
        provenance: 'saved',
        material: [],
        learningBlocks: learningBlockSourceMaterial([grammar]),
    };
}

const exerciseRequest: ExerciseGenerationRequest = {
    mode: 'selected',
    count: 5,
    activities: [
        { activityId: 'G01', count: 2 },
        { activityId: 'G03', count: 3 },
    ],
    language: 'fr',
    explanationLanguage: 'en',
    difficulty: 'intermediate',
};

function ownedSnapshot(): ConversationSourceSnapshot {
    const frozen = snapshot();

    return {
        ...frozen,
        blockTarget: {
            branchId: foreign,
            version: 2,
            material: frozen.learningBlocks ?? [],
        },
    };
}

function exerciseTurn(): SubmitConversationTurnRequest {
    return {
        requestId: foreign,
        content: 'Generate these exercises.',
        attachments: [],
        blockReferences: [id],
        exerciseRequest,
    };
}

describe('authorized block references', () => {
    it('restricts explicit-reference update targets while preserving legacy turns and append proposals', () => {
        const frozen = snapshot();
        expect(() =>
            assertReferencedProposalTarget(frozen, foreign),
        ).not.toThrow();

        captureBlockReferences(frozen, [id], 'knowledge');
        expect(() => assertReferencedProposalTarget(frozen, id)).not.toThrow();
        expect(() => assertReferencedProposalTarget(frozen)).not.toThrow();
        expect(() => assertReferencedProposalTarget(frozen, foreign)).toThrow(
            'explicitly mentioned',
        );
    });

    it('rejects foreign, duplicate, excessive and non-knowledge references', () => {
        for (const ids of [
            [foreign],
            [id, id],
            Array.from({ length: 9 }, () => id),
        ]) {
            expect(() =>
                captureBlockReferences(snapshot(), ids, 'knowledge'),
            ).toThrow();
        }

        expect(() =>
            captureBlockReferences(snapshot(), [id], 'text'),
        ).toThrow();
    });

    it('sends compact selected descriptors initially and retrieves exact authorized content', () => {
        const frozen = snapshot();
        captureBlockReferences(frozen, [id], 'knowledge');
        const source = projectConversationSource(
            'knowledge',
            frozen,
            'explain',
        );

        expect(source.initialContext.referencedBlocks).toEqual([
            { id, type: 'grammar', title: grammar.title },
        ]);

        expect(JSON.stringify(source.initialContext)).not.toContain(
            grammar.rule,
        );

        const result = source.read({ query: 'rule', limit: 1, blockIds: [id] });
        expect(result.material[0]?.content).toBe(JSON.stringify(grammar));
        expect(() =>
            source.read({ query: 'foreign', limit: 1, blockIds: [foreign] }),
        ).toThrow();
    });

    it('rejects an oversized exact read rather than silently returning part of a target', () => {
        const frozen = snapshot();
        frozen.learningBlocks![0]!.content = JSON.stringify({
            ...grammar,
            rule: 'é'.repeat(20_000),
        });

        captureBlockReferences(frozen, [id], 'knowledge');
        expect(() =>
            projectConversationSource('knowledge', frozen, 'explain').read({
                query: 'rule',
                limit: 1,
                blockIds: [id],
            }),
        ).toThrow('No content was truncated');
    });

    it('keeps one complete editor snapshot and surrounding register guidance with mentioned grammar', () => {
        const editor = 'Use informal register.\nGrammar topic: le subjonctif.';
        const message = projectTutorUserMessage({
            content: 'Explain these',
            blockReferences: [id],
            editorContext: {
                content: editor,
            },
        });

        expect(JSON.stringify(message)).toContain(id);
        expect(
            message.parts.filter((part) =>
                part.text.startsWith('Current complete editor snapshot'),
            ),
        ).toHaveLength(1);

        expect(message.parts.some((part) => part.text.includes(editor))).toBe(
            true,
        );

        expect(JSON.stringify(message)).toContain('Use informal register.');
    });

    it('rejects a reference turn that exceeds the existing message allowance instead of dropping its editor snapshot', () => {
        const message = projectTutorUserMessage({
            content: 'Explain these',
            blockReferences: [id],
            editorContext: {
                content: 'x'.repeat(currentTutorMessageByteLimit),
            },
        });

        expect(() => assertTutorCurrentMessageFits(message)).toThrow();
    });
});

describe('source-bound exercise picker manifests', () => {
    it('preserves the exact manifest and authorized block selection in the private admitted projection', () => {
        const frozen = ownedSnapshot();
        const request = exerciseTurn();
        const modelContent = prepareReferencedTutorMessage({
            snapshot: frozen,
            sourceKind: 'knowledge',
            request,
            content: request.content,
            attachments: [],
        });

        expect(modelContent.exerciseRequest).toEqual(exerciseRequest);
        expect(modelContent.blockReferences).toEqual([id]);
        expect(frozen.blockReferences).toEqual([id]);
        expect(frozen.blockReferences).not.toBe(request.blockReferences);
        expect(modelContent.parts[0]?.text).toBe(request.content);
        expect(JSON.stringify(modelContent)).toContain(
            'Mentioned learning block IDs',
        );

        expect(modelContent).not.toHaveProperty('ownerId');
        expect(modelContent).not.toHaveProperty('modelId');
    });

    it('requires a server-created owned Knowledge target and does not grant authority from a manifest', () => {
        const request = exerciseTurn();
        expect(() =>
            prepareReferencedTutorMessage({
                snapshot: snapshot(),
                sourceKind: 'knowledge',
                request,
                content: request.content,
                attachments: [],
            }),
        ).toThrow('owned Knowledge editing context');

        expect(() =>
            prepareReferencedTutorMessage({
                snapshot: ownedSnapshot(),
                sourceKind: 'text',
                request,
                content: request.content,
                attachments: [],
            }),
        ).toThrow('owned Knowledge editing context');
    });

    it('rejects an unavailable block selector without replacing an existing authorized selection', () => {
        const frozen = ownedSnapshot();
        frozen.blockReferences = [id];
        const request = { ...exerciseTurn(), blockReferences: [foreign] };
        expect(() =>
            prepareReferencedTutorMessage({
                snapshot: frozen,
                sourceKind: 'knowledge',
                request,
                content: request.content,
                attachments: [],
            }),
        ).toThrow('no longer available');

        expect(frozen.blockReferences).toEqual([id]);
    });

    it('keeps ordinary source explanation available without requiring an owned writer target', () => {
        const request: SubmitConversationTurnRequest = {
            requestId: foreign,
            content: 'Explain.',
            attachments: [],
            blockReferences: [id],
        };
        const modelContent = prepareReferencedTutorMessage({
            snapshot: snapshot(),
            sourceKind: 'knowledge',
            request,
            content: request.content,
            attachments: [],
        });

        expect(modelContent.blockReferences).toEqual([id]);
        expect(modelContent).not.toHaveProperty('exerciseRequest');
    });

    it('ignores fresh retry selectors and manifests in fallback projection while retaining frozen references and original content', () => {
        const frozen = ownedSnapshot();
        frozen.blockReferences = [id];
        const request = {
            ...exerciseTurn(),
            retryOf: foreign,
            blockReferences: [foreign],
            content: 'Replace the original question.',
        };
        const modelContent = prepareReferencedTutorMessage({
            snapshot: frozen,
            sourceKind: 'knowledge',
            request,
            content: 'Original admitted question.',
            attachments: [],
        });

        expect(modelContent.blockReferences).toEqual([id]);
        expect(frozen.blockReferences).toEqual([id]);
        expect(modelContent.parts[0]?.text).toBe('Original admitted question.');
        expect(modelContent).not.toHaveProperty('exerciseRequest');
    });

    it('does not let an unsolicited retry manifest change the authority requirements of an existing explanation', () => {
        const frozen = snapshot();
        frozen.blockReferences = [id];
        const request = {
            ...exerciseTurn(),
            retryOf: foreign,
            blockReferences: [foreign],
        };
        const modelContent = prepareReferencedTutorMessage({
            snapshot: frozen,
            sourceKind: 'knowledge',
            request,
            content: 'Original read-only explanation.',
            attachments: [],
        });

        expect(modelContent.parts[0]?.text).toBe(
            'Original read-only explanation.',
        );

        expect(modelContent.blockReferences).toEqual([id]);
        expect(modelContent).not.toHaveProperty('exerciseRequest');
    });

    it('charges the complete serialized manifest to the existing current-message byte limit', () => {
        const plain = projectTutorUserMessage({
            content: 'Generate exercises.',
        });
        const selected = projectTutorUserMessage({
            content: 'Generate exercises.',
            exerciseRequest,
        });
        const plainBytes = tutorCurrentMessageBytes(plain);
        const selectedBytes = tutorCurrentMessageBytes(selected);
        expect(selectedBytes).toBeGreaterThan(plainBytes);
        expect(selectedBytes - plainBytes).toBe(
            Buffer.byteLength(
                `,"exerciseRequest":${JSON.stringify(exerciseRequest)}`,
                'utf8',
            ),
        );

        expect(() =>
            assertTutorCurrentMessageFits(plain, plainBytes),
        ).not.toThrow();

        expect(() =>
            assertTutorCurrentMessageFits(selected, plainBytes),
        ).toThrow('Shorten the question');

        expect(() =>
            assertTutorCurrentMessageFits(selected, selectedBytes),
        ).not.toThrow();
    });
});
