import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
    getExerciseActivity,
    type ExerciseActivityId,
    type LearningBlock,
} from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { useEditorInsertNavigation } from './use-editor-insert-navigation';
import { useEditorInsertPicker } from './use-editor-insert-picker';
import { editorInsertCopy } from '../lib/editor-insert-copy';
import type { BlockKind } from '../lib/learning-block-form';
import { useBlockAuthoring } from '../ui/learning-block-authoring/ui/block-authoring-context/block-authoring-context';
import { applyEditorBasic, type Basic } from '../lib/editor-basic-command';
import { insertBlocksAtTarget } from '../lib/editor-insertion-target';
export function useEditorInsertActions(
    editor: Editor,
    disabled: boolean,
    onGenerateExercise?: ((id: ExerciseActivityId) => void) | undefined,
) {
    const { locale } = useI18n();
    const copy = editorInsertCopy(locale);
    const picker = useEditorInsertPicker(editor, disabled);
    const authoring = useBlockAuthoring()!;
    const navigation = useEditorInsertNavigation(picker.panelRef);
    const { level, query, setQuery, enter, back, reset } = navigation;
    const [activityId, setActivityId] = useState<ExerciseActivityId>('V02');
    const [preview, setPreview] = useState<ExerciseActivityId | null>(null);
    const [error, setError] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const previewTrigger = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (picker.open) {
            reset();
            setError(false);
        }
    }, [picker.open]);

    function changeOpen(next: boolean) {
        if (next) {
            reset();
            picker.show();
        } else if (!preview && !libraryOpen) {
            picker.close();
        }
    }

    function search(value: string) {
        setQuery(value);
    }

    function exercises() {
        enter('exercises');
    }

    function basics() {
        enter('basic');
    }

    function learning() {
        enter('learning');
    }

    function choose(id: ExerciseActivityId) {
        setActivityId(id);
        enter('activity');
    }

    function showPreview(id: ExerciseActivityId) {
        setActivityId(id);
        previewTrigger.current = document.activeElement as HTMLElement;
        setPreview(id);
    }

    function closePreview() {
        setPreview(null);
        requestAnimationFrame(() =>
            previewTrigger.current?.focus({ preventScroll: true }),
        );
    }

    function showCurrentPreview() {
        showPreview(activityId);
    }

    function manual(kind: BlockKind, selected?: ExerciseActivityId) {
        const insertion = picker.target.current;
        if (!insertion?.resolve()) {
            setError(true);

            return;
        }

        authoring.setEditing({
            kind,
            insertion: picker.detach()!,
            ...(selected
                ? { initialFormat: getExerciseActivity(selected).format }
                : {}),
        });
    }

    function customSet() {
        const insertion = picker.target.current;
        if (!insertion?.resolve()) {
            setError(true);

            return;
        }

        authoring.setEditing({
            kind: 'exercise',
            exerciseSet: true,
            insertion: picker.detach()!,
        });
    }

    function custom() {
        setPreview(null);
        manual('exercise', activityId);
    }

    function generate() {
        const range = picker.target.current?.resolve();
        if (!range || !onGenerateExercise) {
            setError(true);

            return;
        }

        picker.detach()?.release();
        editor.chain().focus().deleteRange(range).run();
        setPreview(null);
        onGenerateExercise(activityId);
    }

    function openLibrary() {
        setLibraryOpen(true);
    }

    function closeLibrary() {
        setLibraryOpen(false);
    }

    function insertLibrary(block: LearningBlock) {
        const target = picker.target.current;
        if (!target || !insertBlocksAtTarget(editor, target, [block])) {
            setError(true);

            return false;
        }

        setLibraryOpen(false);
        picker.close();

        return true;
    }

    const normalized = query.trim().toLocaleLowerCase();
    const basic: Basic[] = [
        'paragraph',
        'heading1',
        'heading2',
        'heading3',
        'bulletList',
        'orderedList',
        'blockquote',
        'horizontalRule',
        'table',
    ];

    function basicLabel(kind: Basic) {
        return kind.startsWith('heading')
            ? `${copy.heading} ${kind.slice(-1)}`
            : copy[
                  kind as Exclude<Basic, 'heading1' | 'heading2' | 'heading3'>
              ];
    }

    function matches(value: string) {
        return !normalized || value.toLocaleLowerCase().includes(normalized);
    }

    function applyBasic(kind: Basic) {
        const range = picker.target.current?.resolve();
        if (!range) {
            setError(true);

            return;
        }

        if (applyEditorBasic(editor, range, kind)) {
            picker.close();
        } else {
            setError(true);
        }
    }

    return {
        locale,
        copy,
        picker,
        level,
        query,
        activityId,
        preview,
        error,
        libraryOpen,
        changeOpen,
        search,
        back,
        exercises,
        choose,
        showPreview,
        closePreview,
        showCurrentPreview,
        manual,
        custom,
        customSet,
        generate,
        openLibrary,
        closeLibrary,
        insertLibrary,
        basics,
        learning,
        basic,
        basicLabel,
        matches,
        applyBasic,
        restoringFocus: navigation.restoringFocus,
    };
}
