import { describe, expect, it } from 'vitest';
import {
    captureBlockReferences,
    assertReferencedProposalTarget,
} from './conversation-block-references';
import { learningBlockSourceMaterial } from './learning-block-source-material';
import { projectConversationSource } from './conversation-source-context';
import {
    assertTutorCurrentMessageFits,
    currentTutorMessageByteLimit,
    projectTutorUserMessage,
} from './tutor-message-context';
import type { ConversationSourceSnapshot } from '../domain/conversation';

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
        ])
            expect(() =>
                captureBlockReferences(snapshot(), ids, 'knowledge'),
            ).toThrow();
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
