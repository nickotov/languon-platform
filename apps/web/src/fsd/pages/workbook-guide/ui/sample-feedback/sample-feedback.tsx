'use client';

import { useState, type ChangeEvent } from 'react';
import {
    ExerciseEvaluation,
    type LearningBlockLabels,
} from '@/fsd/entities/learning-blocks';
import { Button, Select } from '@/fsd/shared/ui';
import type { GuideActivity } from '../../lib/examples';
import type { GuideUiCopy } from '../copy';
import styles from './sample-feedback.module.css';

export function SampleFeedback({
    responses,
    copy,
    labels,
}: {
    responses: GuideActivity['sampleResponses'];
    copy: GuideUiCopy;
    labels: LearningBlockLabels;
}) {
    const [visible, setVisible] = useState(false);
    const [selected, setSelected] = useState(responses[0]?.id);
    const response =
        responses.find((item) => item.id === selected) ?? responses[0];
    const options = responses.map((item) => ({
        value: item.id,
        label: item.label,
    }));

    function handleShow() {
        setVisible(true);
    }

    function handleSelect(event: ChangeEvent<HTMLSelectElement>) {
        setSelected(event.target.value);
    }

    if (!response) {
        return null;
    }

    return (
        <section className={styles.root} data-testid='sample-feedback'>
            <h3>{copy.sampleTitle}</h3>
            <p>{copy.sampleNotice}</p>
            <Select
                label={copy.sampleResponse}
                options={options}
                value={selected}
                onChange={handleSelect}
            />
            <blockquote dir='auto'>{response.answer}</blockquote>
            <Button type='button' variant='secondary' onClick={handleShow}>
                {copy.sample}
            </Button>
            {visible && (
                <ExerciseEvaluation
                    evaluation={response.evaluation}
                    labels={labels}
                />
            )}
        </section>
    );
}
