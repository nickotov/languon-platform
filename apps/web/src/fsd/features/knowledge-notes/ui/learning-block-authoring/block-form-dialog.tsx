'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { LearningBlock } from '@languon/contracts';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import { Button, Dialog, InlineAlert } from '@/fsd/shared/ui';
import {
    blockForm,
    readBlockForm,
    type BlockKind,
} from '../../lib/learning-block-form';
import { ExerciseSourcePicker } from './exercise-source-picker';
import { BlockFieldInput, BlockRowGroup } from './block-form-fields';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';

export function BlockFormDialog({
    kind,
    block,
    labels,
    onClose,
    onApply,
    sources,
}: {
    kind: BlockKind;
    block?: LearningBlock | undefined;
    labels: BlockAuthoringLabels;
    onClose(): void;
    onApply(block: LearningBlock): boolean;
    sources: LearningBlock[];
}) {
    const [format, setFormat] = useState(
        block?.type === 'exercise' ? block.format : 'free-text',
    );
    const [error, setError] = useState(false);
    const [preview, setPreview] = useState<LearningBlock | null>(null);
    const form = useRef<HTMLFormElement>(null);
    const [definition] = useState(() => blockForm(kind, block));
    const counts = useRef(
        Object.fromEntries(
            definition.groups.map((group) => [group.name, group.rows.length]),
        ),
    );
    function count(name: string, value: number) {
        counts.current[name] = value;
    }
    function parse() {
        if (!form.current) return null;
        try {
            const result = readBlockForm(
                kind,
                new FormData(form.current),
                counts.current,
                block,
            );
            setError(false);
            return result;
        } catch {
            setError(true);
            return null;
        }
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        const result = parse();
        if (result && !onApply(result)) setError(true);
    }
    function change(event: React.FormEvent<HTMLFormElement>) {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.name === 'format') {
            const next = target.value;
            if (
                next === 'free-text' ||
                next === 'multiple-choice' ||
                next === 'fill-in-the-blank'
            )
                setFormat(next);
        }
    }
    function visibleField(name: string) {
        if (name === 'correctChoice') return format === 'multiple-choice';
        if (name === 'gapText') return format === 'fill-in-the-blank';
        if (name === 'acceptedAnswers') return format === 'free-text';
        return true;
    }
    const fields = definition.fields.filter((field) =>
        visibleField(field.name),
    );
    const groups = definition.groups.filter(
        (group) => group.name !== 'choices' || format === 'multiple-choice',
    );
    function showPreview() {
        setPreview(parse());
    }
    const title = labels.view.kinds[kind];
    const preparedTranslations =
        block?.type === 'bilingual-text' ? block.translations : [];
    const hasPreparedTranslations = preparedTranslations.length > 0;
    const selectedPreparedLanguage = preparedTranslations[0]?.language ?? '';
    function chooseTranslation(language: string) {
        if (!form.current || block?.type !== 'bilingual-text') return;
        const translation = block.translations.find(
            (item) => item.language === language,
        );
        const languageInput = form.current.elements.namedItem(
            'translationLanguage',
        );
        if (languageInput instanceof HTMLInputElement)
            languageInput.value = language;
        for (
            let index = 0;
            index < (counts.current['segments'] ?? 0);
            index++
        ) {
            const input = form.current.elements.namedItem(
                `segments.${index}.translation`,
            );
            if (input instanceof HTMLTextAreaElement)
                input.value =
                    translation?.segments.find(
                        (item) =>
                            item.sourceSegmentId === block.segments[index]?.id,
                    )?.text ?? '';
        }
        setPreview(null);
        setError(false);
    }
    function handlePreparedTranslationChange(
        event: ChangeEvent<HTMLSelectElement>,
    ) {
        chooseTranslation(event.target.value);
    }
    return (
        <Dialog
            open
            onClose={onClose}
            title={title}
            closeLabel={labels.cancel}
            size='large'
        >
            <form
                ref={form}
                onSubmit={submit}
                onChange={change}
                className={styles.form}
            >
                {hasPreparedTranslations && (
                    <label className={styles.field}>
                        {labels.field('Prepared translation')}
                        <select
                            defaultValue={selectedPreparedLanguage}
                            onChange={handlePreparedTranslationChange}
                        >
                            {preparedTranslations.map((translation) => (
                                <option
                                    key={translation.language}
                                    value={translation.language}
                                >
                                    {translation.language}
                                </option>
                            ))}
                            <option value=''>
                                {labels.field('Add translation')}
                            </option>
                        </select>
                    </label>
                )}
                {fields.map((field) => (
                    <BlockFieldInput
                        key={field.name}
                        field={field}
                        labels={labels}
                    />
                ))}
                {groups.map((group) => (
                    <BlockRowGroup
                        key={group.name}
                        group={group}
                        labels={labels}
                        onCount={count}
                    />
                ))}
                {kind === 'exercise' && (
                    <ExerciseSourcePicker
                        sources={sources}
                        initial={
                            block?.type === 'exercise'
                                ? block.source
                                : undefined
                        }
                        labels={labels}
                    />
                )}
                {error && (
                    <InlineAlert tone='error'>{labels.error}</InlineAlert>
                )}
                <div className={styles.actions}>
                    <Button
                        type='button'
                        variant='secondary'
                        onClick={showPreview}
                    >
                        {labels.preview}
                    </Button>
                    <Button type='submit'>{labels.apply}</Button>
                </div>
            </form>
            {preview !== null && (
                <section className={styles.preview} aria-label={labels.preview}>
                    <LearningBlockView block={preview} labels={labels.view} />
                </section>
            )}
        </Dialog>
    );
}
