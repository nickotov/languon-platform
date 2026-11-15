import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { SubmitConversationTurnRequest } from '@languon/contracts';
import { PromptMention } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/ui/prompt-mention/prompt-mention';
import { usePromptExerciseRequest } from '../src/fsd/widgets/contextual-assistant/hooks/use-prompt-exercise-request';
import { usePromptSources } from '../src/fsd/widgets/contextual-assistant/hooks/use-prompt-sources';
import {
    promptDocument,
    serializePrompt,
} from '../src/fsd/widgets/contextual-assistant/lib/prompt-document';
import {
    replacePreparedInstruction,
    stripPromptSelections,
} from '../src/fsd/widgets/contextual-assistant/lib/prompt-selection';
import type { KnowledgeBlockReference } from '../src/fsd/features/knowledge-notes';

const sourceA: KnowledgeBlockReference = {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'vocabulary',
    title: 'Source A',
};
const sourceB: KnowledgeBlockReference = {
    id: '00000000-0000-4000-8000-000000000002',
    type: 'vocabulary',
    title: 'Source B',
};

type Request = SubmitConversationTurnRequest['exerciseRequest'];
function selected(id: 'V02' | 'V03'): Request {
    return {
        mode: 'selected',
        count: 1,
        language: 'en',
        explanationLanguage: 'en',
        difficulty: 'beginner',
        activities: [{ activityId: id, count: 1 }],
    };
}

const editors: Editor[] = [];
function makeEditor() {
    const editor = new Editor({
        extensions: [
            StarterKit,
            PromptMention.extend({
                addNodeView() {
                    return undefined;
                },
            }),
        ],
        content: promptDocument('Keep my prose.', []),
    });

    editors.push(editor);

    return editor;
}

function identities(editor: Editor) {
    return serializePrompt(editor.getJSON()).promptMentions.map((mention) =>
        mention.kind === 'exercise' ? mention.activityId : mention.blockId,
    );
}

afterEach(() => {
    cleanup();
    editors.splice(0).forEach((editor) => editor.destroy());
});

describe('advanced and inline prompt selection', () => {
    it('replaces prepared types and sources atomically, preserves prose, reapplies without duplicates and clears', () => {
        const editor = makeEditor();
        const { rerender } = renderHook(
            (props: { request: Request; sources: KnowledgeBlockReference[] }) =>
                usePromptExerciseRequest(
                    editor,
                    props.request,
                    'en',
                    props.sources,
                ),
            { initialProps: { request: selected('V02'), sources: [sourceA] } },
        );

        expect(identities(editor)).toEqual(['V02', sourceA.id]);
        rerender({ request: selected('V03'), sources: [sourceB] });
        expect(identities(editor)).toEqual(['V03', sourceB.id]);
        expect(serializePrompt(editor.getJSON()).content).toBe(
            'Keep my prose. Complete the sentence Source B',
        );

        expect(serializePrompt(editor.getJSON()).content).toContain(
            'Keep my prose.',
        );

        rerender({ request: selected('V03'), sources: [sourceB] });
        expect(identities(editor)).toEqual(['V03', sourceB.id]);
        rerender({ request: undefined, sources: [sourceB] });
        expect(identities(editor)).toEqual([]);
        expect(editor.state.doc.textContent).toBe('Keep my prose.');
    });

    it('switches to automatic without retaining named exercise nodes', () => {
        const editor = makeEditor();
        const { rerender } = renderHook(
            (request: Request) =>
                usePromptExerciseRequest(editor, request, 'en', [sourceA]),
            { initialProps: selected('V02') },
        );

        rerender({
            mode: 'automatic',
            count: 5,
            language: 'en',
            explanationLanguage: 'en',
            difficulty: 'beginner',
        });

        expect(identities(editor)).toEqual([sourceA.id]);
    });

    it('keeps selection ownership when controlled prompt text is rebuilt', () => {
        const editor = makeEditor();
        const { rerender } = renderHook(
            (request: Request) =>
                usePromptExerciseRequest(editor, request, 'en', [sourceA]),
            { initialProps: selected('V02') },
        );
        const value = serializePrompt(editor.getJSON());
        act(() =>
            editor.commands.setContent(
                promptDocument(
                    value.content,
                    value.promptMentions,
                    editor.getJSON(),
                ),
                { emitUpdate: false },
            ),
        );

        rerender(undefined);
        expect(identities(editor)).toEqual([]);
    });

    it('reconciles external references and visibly retains unavailable referenced nodes', () => {
        const editor = makeEditor();
        const { rerender } = renderHook(
            (props: {
                selected: KnowledgeBlockReference[];
                available: KnowledgeBlockReference[];
            }) => usePromptSources(editor, props.selected, props.available),
            {
                initialProps: {
                    selected: [sourceA],
                    available: [sourceA, sourceB],
                },
            },
        );

        rerender({ selected: [sourceB], available: [sourceA, sourceB] });
        expect(identities(editor)).toEqual([sourceB.id]);
        rerender({ selected: [], available: [sourceA] });
        expect(identities(editor)).toEqual([sourceB.id]);
        const node = editor
            .getJSON()
            .content?.[0]?.content?.find(
                (item) => item.type === 'promptMention',
            );

        expect(node?.attrs?.missing).toBe(true);
    });

    it('replaces only the exact generated suffix after removing its selected tokens', () => {
        const content = 'User prose.\n\nGenerate 1 question. Choose meaning';
        const start = content.indexOf('Choose meaning');
        const value = replacePreparedInstruction(
            stripPromptSelections({
                content,
                promptMentions: [
                    {
                        kind: 'exercise',
                        activityId: 'V02',
                        catalogVersion: 1,
                        start,
                        end: content.length,
                    },
                ],
            }),
            'Generate 1 question.',
            'Generate 12 questions.',
        );

        expect(value).toEqual({
            content: 'User prose.\n\nGenerate 12 questions.',
            promptMentions: [],
        });
    });

    it('never replaces the same phrase in user prose when its generated suffix was edited or removed', () => {
        for (const content of [
            'Generate 1 question. is an example phrase.',
            'User prose.\n\nGenerate 1 question. edited by me',
        ]) {
            const value = replacePreparedInstruction(
                { content, promptMentions: [] },
                'Generate 1 question.',
                'Generate 12 questions.',
            );

            expect(value.content).toBe(`${content}\n\nGenerate 12 questions.`);
        }
    });
});

it('native inline chips expose preview and removal without React lifecycle rendering', () => {
    const preview = vi.fn();
    const editor = new Editor({
        extensions: [
            StarterKit,
            PromptMention.configure({ onPreview: preview }),
        ],
        content: promptDocument('Choose meaning', [
            {
                kind: 'exercise',
                activityId: 'V02',
                catalogVersion: 1,
                start: 0,
                end: 14,
            },
        ]),
    });

    editors.push(editor);
    const before = serializePrompt(editor.getJSON());
    const previewButton = editor.view.dom.querySelector<HTMLButtonElement>(
        '[aria-label="Preview exercise: Choose meaning"]',
    );

    expect(previewButton).not.toBeNull();
    previewButton!.click();
    expect(preview).toHaveBeenCalledWith('V02');
    expect(serializePrompt(editor.getJSON())).toEqual(before);
    editor.view.dom
        .querySelector<HTMLButtonElement>(
            '[aria-label="Remove: Choose meaning"]',
        )!
        .click();

    expect(identities(editor)).toEqual([]);
});
