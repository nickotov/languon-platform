import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SubmitConversationTurnRequestSchema } from './contextual-assistant';
import { ResolveGenerationRunSourceRequestSchema } from './generation-runs';

const content = 'Hi 🦊 France';
const context = {
    content,
    selectedText: '🦊',
    workingBranch: { id: randomUUID(), version: 3 },
    editorTarget: {
        from: 3,
        to: 5,
        originalText: '🦊',
        documentHash: createHash('sha256').update(content).digest('hex'),
    },
};
const refresh = {
    requestId: randomUUID(),
    expectedRevision: 2,
    choice: 'refresh',
    sourceId: 'selected-reading',
    editorContext: context,
};

describe('shared editor context and explicit selection refresh', () => {
    it('preserves submit-turn context and allows an exact UTF-16 selection refresh', () => {
        const submitted = SubmitConversationTurnRequestSchema.parse({
            requestId: randomUUID(),
            content: 'Explain the selection.',
            editorContext: context,
        });

        expect(submitted.editorContext).toEqual(context);
        expect(ResolveGenerationRunSourceRequestSchema.parse(refresh)).toEqual(
            refresh,
        );

        expect(
            ResolveGenerationRunSourceRequestSchema.safeParse({
                requestId: randomUUID(),
                expectedRevision: 2,
                choice: 'keep-snapshot',
            }).success,
        ).toBe(true);

        expect(
            ResolveGenerationRunSourceRequestSchema.safeParse({
                requestId: randomUUID(),
                expectedRevision: 2,
                choice: 'refresh',
            }).success,
        ).toBe(true);
    });

    it('requires the explicit source/context pair only when refreshing', () => {
        for (const candidate of [
            { ...refresh, sourceId: undefined },
            { ...refresh, editorContext: undefined },
            { ...refresh, choice: 'keep-snapshot' },
            { ...refresh, sourceId: 'not a source identity' },
        ]) {
            expect(
                ResolveGenerationRunSourceRequestSchema.safeParse(candidate)
                    .success,
            ).toBe(false);
        }
    });

    it('rejects empty, invented, mismatched or unbound replacement selections', () => {
        for (const editorContext of [
            { ...context, workingBranch: undefined },
            {
                ...context,
                workingBranch: { ...context.workingBranch, version: 0 },
            },
            { ...context, selectedText: undefined },
            { ...context, selectedText: '' },
            { ...context, selectedText: 'France' },
            {
                ...context,
                editorTarget: { ...context.editorTarget, from: 5, to: 3 },
            },
            { ...context, editorTarget: { ...context.editorTarget, to: 100 } },
            {
                ...context,
                editorTarget: {
                    ...context.editorTarget,
                    documentHash: 'invented',
                },
            },
            { ...context, content: 'Different text' },
            { ...context, ownerId: randomUUID() },
        ]) {
            expect(
                ResolveGenerationRunSourceRequestSchema.safeParse({
                    ...refresh,
                    editorContext,
                }).success,
            ).toBe(false);
        }
    });

    it('keeps ordinary cursor turns valid while refusing to treat them as fresh source selections', () => {
        const cursor = {
            ...context,
            selectedText: '',
            editorTarget: {
                ...context.editorTarget,
                from: 0,
                to: 0,
                originalText: '',
            },
        };

        expect(
            SubmitConversationTurnRequestSchema.safeParse({
                requestId: randomUUID(),
                content: 'Write an introduction.',
                editorContext: cursor,
            }).success,
        ).toBe(true);

        expect(
            ResolveGenerationRunSourceRequestSchema.safeParse({
                ...refresh,
                editorContext: cursor,
            }).success,
        ).toBe(false);
    });
});
