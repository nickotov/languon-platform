'use client';
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ExerciseLearningBlock, LearningBlock } from '@languon/contracts';
import { useBlockFormDraft } from '../../hooks/use-block-form-draft';
import { BlockEditorForm } from './block-editor-form';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';
type Item = { key: string; block?: ExerciseLearningBlock };
type ReadItem = () => LearningBlock | null;
export type ExerciseSetFieldsHandle = {
    read(): ExerciseLearningBlock[] | null;
};

/** Reusable question-set editing inside an exercise panel or an audio panel. */
export const ExerciseSetFields = forwardRef<
    ExerciseSetFieldsHandle,
    {
        exercises: ExerciseLearningBlock[];
        labels: BlockAuthoringLabels;
        sources: LearningBlock[];
        onDirty(): void;
        onSubmit(): void;
        allowEmpty?: boolean;
    }
>(function ExerciseSetFields(
    { exercises, labels, sources, onDirty, onSubmit, allowEmpty = false },
    ref,
) {
    const [items, setItems] = useState<Item[]>(() =>
        exercises.length
            ? exercises.map((block) => ({ key: block.id, block }))
            : allowEmpty
              ? []
              : [{ key: crypto.randomUUID() }],
    );
    const readers = useRef(new Map<string, ReadItem>());
    const register = useCallback((key: string, read: ReadItem | null) => {
        if (read) readers.current.set(key, read);
        else readers.current.delete(key);
    }, []);
    useImperativeHandle(
        ref,
        () => ({
            read() {
                const next: ExerciseLearningBlock[] = [];
                let valid = allowEmpty || items.length > 0;
                for (const item of items) {
                    const block = readers.current.get(item.key)?.();
                    if (!block || block.type !== 'exercise') {
                        valid = false;
                        continue;
                    }
                    next.push(block);
                }
                return valid ? next : null;
            },
        }),
        [items, allowEmpty],
    );
    function add() {
        setItems((current) => [...current, { key: crypto.randomUUID() }]);
        onDirty();
    }
    function remove(key: string) {
        setItems((current) => current.filter((item) => item.key !== key));
        onDirty();
    }
    return (
        <div className={styles.form}>
            {items.map((item, index) => (
                <ExerciseItemEditor
                    key={item.key}
                    item={item}
                    index={index}
                    sources={sources}
                    labels={labels}
                    register={register}
                    markDirty={onDirty}
                    onRemove={remove}
                    onSubmit={onSubmit}
                />
            ))}
            <button
                type='button'
                className={styles.addRow}
                onClick={add}
                disabled={items.length >= 25}
            >
                <Plus size={16} aria-hidden />
                {labels.field('Add question')}
            </button>
        </div>
    );
});

function ExerciseItemEditor({
    item,
    index,
    sources,
    labels,
    register,
    markDirty,
    onRemove,
    onSubmit,
}: {
    item: Item;
    index: number;
    sources: LearningBlock[];
    labels: BlockAuthoringLabels;
    register(key: string, read: ReadItem | null): void;
    markDirty(): void;
    onRemove(key: string): void;
    onSubmit(): void;
}) {
    function applySingle() {
        onSubmit();
        return true;
    }
    function closeSingle() {}
    const draft = useBlockFormDraft({
        kind: 'exercise',
        block: item.block,
        labels,
        onClose: closeSingle,
        onApply: applySingle,
    });
    useEffect(() => {
        register(item.key, draft.parse);
        return () => register(item.key, null);
    }, [item.key, register, draft.parse]);
    useEffect(() => {
        if (draft.dirty) markDirty();
    }, [draft.dirty, markDirty]);
    function remove() {
        onRemove(item.key);
    }
    const removeLabel = `${labels.remove}: ${labels.field('Question')} ${index + 1}`;
    return (
        <section className={styles.row}>
            <div className={styles.rowHeading}>
                <span>
                    {labels.field('Question')} {index + 1}
                </span>
                <button
                    type='button'
                    className={styles.removeRow}
                    aria-label={removeLabel}
                    onClick={remove}
                >
                    <Trash2 size={16} aria-hidden />
                </button>
            </div>
            <BlockEditorForm
                draft={draft}
                kind='exercise'
                block={item.block}
                labels={labels}
                sources={sources}
                hideTitle
            />
        </section>
    );
}
