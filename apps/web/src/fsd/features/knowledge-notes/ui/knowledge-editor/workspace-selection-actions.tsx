'use client';

import { useState, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Bold, ChevronLeft, Ellipsis, Italic, Sparkles } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { useI18n } from '@/fsd/shared/i18n';
import type {
    KnowledgeTutorAction,
    KnowledgeWorkspaceEditorOptions,
} from '../knowledge-note-form/knowledge-note-form';
import styles from './workspace-editor-chrome.module.css';
import { useWorkspaceSelectionPosition } from '../../hooks/use-workspace-selection-position';

export function WorkspaceSelectionActions({
    editor,
    workspace,
    passage,
}: {
    editor: Editor;
    workspace: KnowledgeWorkspaceEditorOptions;
    passage: string;
}) {
    const { t } = useI18n();
    const [more, setMore] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    useWorkspaceSelectionPosition(editor, root, more);

    const actions: KnowledgeTutorAction[] = more
        ? ['simplify', 'rephrase', 'examples']
        : ['explain', 'correct', 'translate'];
    function preserveSelection(event: MouseEvent) {
        event.preventDefault();
    }
    function askTutor() {
        workspace.onAskTutor(passage);
    }
    function bold() {
        editor.chain().focus().toggleBold().run();
    }
    function italic() {
        editor.chain().focus().toggleItalic().run();
    }
    function toggleMore() {
        setMore((value) => !value);
    }
    function keyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            editor.commands.focus();
        }
    }
    const moreLabel = more
        ? t('knowledge.lessActions')
        : t('knowledge.moreActions');
    return (
        <div
            ref={root}
            role='toolbar'
            aria-label={t('knowledge.selectionActions')}
            className={styles.bubble}
            onKeyDown={keyDown}
        >
            <button
                type='button'
                className={styles.askTutor}
                onMouseDown={preserveSelection}
                onClick={askTutor}
            >
                <Sparkles size={16} aria-hidden />
                {t('knowledge.askTutor')}
            </button>
            {workspace.onTutorAction && (
                <>
                    {actions.map((action) => (
                        <TutorAction
                            key={action}
                            action={action}
                            passage={passage}
                            workspace={workspace}
                        />
                    ))}
                    <button
                        type='button'
                        className={styles.mark}
                        aria-label={moreLabel}
                        aria-expanded={more}
                        onMouseDown={preserveSelection}
                        onClick={toggleMore}
                    >
                        {more ? (
                            <ChevronLeft size={16} aria-hidden />
                        ) : (
                            <Ellipsis size={16} aria-hidden />
                        )}
                    </button>
                </>
            )}
            <span className={styles.separator} aria-hidden />
            <button
                type='button'
                className={styles.mark}
                aria-label={t('knowledge.bold')}
                aria-pressed={editor.isActive('bold')}
                onMouseDown={preserveSelection}
                onClick={bold}
            >
                <Bold size={16} aria-hidden />
            </button>
            <button
                type='button'
                className={styles.mark}
                aria-label={t('knowledge.italic')}
                aria-pressed={editor.isActive('italic')}
                onMouseDown={preserveSelection}
                onClick={italic}
            >
                <Italic size={16} aria-hidden />
            </button>
        </div>
    );
}

const actionKeys = {
    explain: 'knowledge.selectionExplain',
    correct: 'knowledge.selectionCorrect',
    translate: 'knowledge.selectionTranslate',
    simplify: 'knowledge.selectionSimplify',
    rephrase: 'knowledge.selectionRephrase',
    examples: 'knowledge.selectionExamples',
} as const;
function TutorAction({
    action,
    passage,
    workspace,
}: {
    action: KnowledgeTutorAction;
    passage: string;
    workspace: KnowledgeWorkspaceEditorOptions;
}) {
    const { t } = useI18n();
    function preserveSelection(event: MouseEvent) {
        event.preventDefault();
    }
    function select() {
        workspace.onTutorAction?.(action, passage);
    }
    return (
        <button
            type='button'
            className={styles.action}
            disabled={workspace.tutorBusy}
            onMouseDown={preserveSelection}
            onClick={select}
        >
            {t(actionKeys[action])}
        </button>
    );
}
