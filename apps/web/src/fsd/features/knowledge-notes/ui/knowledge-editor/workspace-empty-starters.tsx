'use client';

import { BookOpen, Languages, PencilLine, Sparkles } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { MouseEvent } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { showToast } from '@/fsd/shared/ui';
import type { KnowledgeWorkspaceEditorOptions } from '../knowledge-note-form/knowledge-note-form';
import styles from './workspace-editor-chrome.module.css';

export function WorkspaceEmptyStarters({
    editor,
    workspace,
    disabled,
}: {
    editor: Editor;
    workspace: KnowledgeWorkspaceEditorOptions;
    disabled: boolean;
}) {
    const { t } = useI18n();
    function preserveSelection(event: MouseEvent) {
        event.preventDefault();
    }
    function write() {
        editor.commands.focus('start');
    }
    function undo() {
        editor.chain().focus().undo().run();
    }
    function insertTemplate(kind: 'lesson' | 'language') {
        if (!editor.isEmpty || disabled) return;
        const headings =
            kind === 'lesson'
                ? [
                      t('knowledge.templateLessonTopic'),
                      t('knowledge.templateLessonVocabulary'),
                      t('knowledge.templateLessonGrammar'),
                      t('knowledge.templateLessonExamples'),
                      t('knowledge.templateLessonHomework'),
                  ]
                : [
                      t('knowledge.templateLanguageRule'),
                      t('knowledge.templateLanguageExamples'),
                      t('knowledge.templateLanguageExceptions'),
                      t('knowledge.templateLanguageMistakes'),
                  ];
        const content = headings.flatMap((text) => [
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text }],
            },
            { type: 'paragraph' },
        ]);
        editor
            .chain()
            .focus()
            .insertContentAt(
                { from: 0, to: editor.state.doc.content.size },
                content,
            )
            .run();
        showToast({
            content: t('knowledge.templateInserted'),
            tone: 'success',
            dismissLabel: t('knowledge.cancel'),
            action: (
                <button type='button' className={styles.action} onClick={undo}>
                    {t('knowledge.undo')}
                </button>
            ),
        });
    }
    function lesson() {
        insertTemplate('lesson');
    }
    function language() {
        insertTemplate('language');
    }
    return (
        <div
            className={styles.empty}
            role='group'
            aria-label={t('knowledge.beginWriting')}
        >
            <button
                type='button'
                className={styles.suggestion}
                disabled={disabled}
                onMouseDown={preserveSelection}
                onClick={write}
            >
                <PencilLine size={16} aria-hidden />
                {t('knowledge.startWriting')}
            </button>
            <button
                type='button'
                className={styles.suggestion}
                disabled={disabled || workspace.tutorBusy}
                onMouseDown={preserveSelection}
                onClick={workspace.onAskOutline}
            >
                <Sparkles size={16} aria-hidden />
                {t('knowledge.askOutline')}
            </button>
            <button
                type='button'
                className={styles.suggestion}
                disabled={disabled}
                onMouseDown={preserveSelection}
                onClick={lesson}
            >
                <BookOpen size={16} aria-hidden />
                {t('knowledge.lessonNotes')}
            </button>
            <button
                type='button'
                className={styles.suggestion}
                disabled={disabled}
                onMouseDown={preserveSelection}
                onClick={language}
            >
                <Languages size={16} aria-hidden />
                {t('knowledge.languageNotes')}
            </button>
        </div>
    );
}
