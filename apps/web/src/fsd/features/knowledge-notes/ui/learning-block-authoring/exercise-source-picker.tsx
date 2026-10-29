'use client';
import { useState, type ChangeEvent } from 'react';
import type { LearningBlock } from '@languon/contracts';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';

export function ExerciseSourcePicker({
    sources,
    initial,
    labels,
}: {
    sources: LearningBlock[];
    initial: Extract<LearningBlock, { type: 'exercise' }>['source'];
    labels: BlockAuthoringLabels;
}) {
    const [sourceId, setSourceId] = useState(initial?.blockId ?? '');
    const [selected, setSelected] = useState(initial?.segmentIds ?? []);
    const available = sources.filter(
        (block) =>
            block.type === 'bilingual-text' ||
            ((block.type === 'audio' || block.type === 'video') &&
                Boolean(block.transcript?.segments.length)),
    );
    const source = available.find((block) => block.id === sourceId);
    let passages: { id: string; text: string }[] = [];
    if (source?.type === 'bilingual-text') passages = source.segments;
    if (source?.type === 'audio' || source?.type === 'video')
        passages = source.transcript?.segments ?? [];
    function choose(event: ChangeEvent<HTMLSelectElement>) {
        setSourceId(event.target.value);
        setSelected([]);
    }
    function toggle(event: ChangeEvent<HTMLInputElement>) {
        const id = event.target.value;
        const checked = event.target.checked;
        setSelected((current) =>
            checked
                ? [...current, id]
                : current.filter((value) => value !== id),
        );
    }
    const sourceLabel = labels.field('Hint source');
    const passagesLabel = labels.field('Relevant passages for hints');
    const noSource = labels.field('No linked source');
    return (
        <fieldset className={styles.group}>
            <legend>{sourceLabel}</legend>
            <label className={styles.field}>
                {sourceLabel}
                <select name='sourceBlockId' value={sourceId} onChange={choose}>
                    <option value=''>{noSource}</option>
                    {available.map((block) => (
                        <option key={block.id} value={block.id}>
                            {block.title ?? labels.view.kinds[block.type]}
                        </option>
                    ))}
                </select>
            </label>
            <fieldset className={styles.passages}>
                <legend>{passagesLabel}</legend>
                {passages.map((passage) => {
                    const snippet =
                        passage.text.length > 240
                            ? Array.from(passage.text).slice(0, 240).join('') +
                              '…'
                            : passage.text;
                    return (
                        <label key={passage.id} className={styles.passage}>
                            <input
                                type='checkbox'
                                name='sourceSegmentIds'
                                value={passage.id}
                                checked={selected.includes(passage.id)}
                                onChange={toggle}
                            />
                            {snippet}
                        </label>
                    );
                })}
            </fieldset>
        </fieldset>
    );
}
