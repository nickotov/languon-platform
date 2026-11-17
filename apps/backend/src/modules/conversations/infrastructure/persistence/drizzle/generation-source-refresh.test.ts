import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    GenerationPlanSchema,
    ResolveGenerationRunSourceRequestSchema,
} from '@languon/contracts';
import type { GenerationExecutionContext } from '../../../application/ports/generation-run';
import { applyRefreshedGenerationSelection } from './generation-source-refresh';

const noteId = randomUUID();
const branchId = randomUUID();
const context: GenerationExecutionContext = {
    runId: randomUUID(),
    revision: 1,
    purpose: 'generation',
    artifacts: [],
    plan: GenerationPlanSchema.parse({
        schemaVersion: 1,
        replyLanguage: 'en',
        sources: [
            { id: 'passage', kind: 'text', reference: { kind: 'selection' } },
        ],
        tasks: [
            {
                id: 'reading',
                kind: 'prose',
                instruction: 'Explain this passage.',
                language: 'fr',
                inputs: [{ kind: 'source', sourceId: 'passage' }],
            },
        ],
        outputOrder: ['reading'],
    }),
    sources: [
        {
            sourceId: 'passage',
            blocks: [],
            selection: { noteId, noteVersion: 1, text: 'Old passage' },
        },
    ],
};
const input = () => {
    const content = 'Updated passage';

    return ResolveGenerationRunSourceRequestSchema.parse({
        requestId: randomUUID(),
        expectedRevision: 1,
        choice: 'refresh',
        sourceId: 'passage',
        editorContext: {
            content,
            selectedText: content,
            editorTarget: {
                from: 0,
                to: content.length,
                originalText: content,
                documentHash: createHash('sha256')
                    .update(content)
                    .digest('hex'),
            },
            workingBranch: { id: branchId, version: 2 },
        },
    });
};
const inspected = () => ({
    sources: context.sources,
    changed: new Set(['passage']),
    unavailable: new Set(['passage']),
});

describe('explicit generation source refresh', () => {
    it('replaces a stale passage from the current authorized editor capture', () => {
        const refreshed = applyRefreshedGenerationSelection(
            context,
            inspected(),
            input(),
            { branchId, version: 2 },
        );

        expect(refreshed.unavailable.size).toBe(0);
        expect(refreshed.changed.has('passage')).toBe(true);
        expect(refreshed.sources[0]?.selection).toMatchObject({
            noteId,
            noteVersion: 2,
            text: 'Updated passage',
            anchor: { from: 0, to: 15 },
        });
    });

    it('rejects a forged content hash before replacing frozen evidence', () => {
        const request = input();
        request.editorContext!.editorTarget.documentHash = '0'.repeat(64);
        expect(() =>
            applyRefreshedGenerationSelection(context, inspected(), request, {
                branchId,
                version: 2,
            }),
        ).toThrow('The proposal target changed');
    });

    it('rejects a different branch and stale branch version', () => {
        expect(() =>
            applyRefreshedGenerationSelection(context, inspected(), input(), {
                branchId: randomUUID(),
                version: 2,
            }),
        ).toThrow('Save the current editor');

        expect(() =>
            applyRefreshedGenerationSelection(context, inspected(), input(), {
                branchId,
                version: 3,
            }),
        ).toThrow('Save the current editor');
    });
});
