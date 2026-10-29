'use client';
import { useId, type ChangeEvent } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useKnowledgeTranscription } from '../../hooks/use-knowledge-transcription';
import { transcriptionCopy } from '../../lib/copy';
import type { KnowledgeTranscriptionProps } from '../../types';
import styles from './knowledge-transcription.module.css';

export function KnowledgeTranscription(props: KnowledgeTranscriptionProps) {
    return <AuthorTranscription key={props.noteId} {...props} />;
}

function AuthorTranscription(props: KnowledgeTranscriptionProps) {
    const { locale } = useI18n();
    const copy = transcriptionCopy[locale];
    const state = useKnowledgeTranscription(props);
    const id = useId();
    const audio = props.blocks.filter((block) => block.type === 'audio');
    const selected = audio.some((block) => block.id === state.selected)
        ? state.selected
        : (audio[0]?.id ?? '');
    function select(event: ChangeEvent<HTMLSelectElement>) {
        state.setSelected(event.target.value);
    }
    function language(event: ChangeEvent<HTMLInputElement>) {
        state.setLanguage(event.target.value);
    }
    function prepare() {
        void state.prepare();
    }
    function confirm() {
        void state.confirm();
    }
    function cancel() {
        void state.cancel();
    }
    function retry() {
        void state.retry();
    }
    function apply() {
        void state.apply();
    }
    const quote = state.job?.state === 'confirmation-required';
    const preview = state.job?.state === 'completed' ? state.job.result : null;
    const jobFailed = state.job?.state === 'failed';
    const cancelled = state.job?.state === 'cancelled';
    const hasSource = audio.length > 0;
    const hasActivity = state.busy || state.job !== null || state.failed;
    if (!hasSource && !hasActivity)
        return props.hideWhenEmpty ? null : <p>{copy.empty}</p>;
    return (
        <section className={styles.root} aria-label={copy.title}>
            <h3>{copy.title}</h3>
            {hasSource && props.variant !== 'focused' && (
                <>
                    <label htmlFor={`${id}-source`}>{copy.source}</label>
                    <select
                        id={`${id}-source`}
                        className={styles.field}
                        value={selected}
                        onChange={select}
                        disabled={state.busy || state.active}
                    >
                        {audio.map((block, index) => (
                            <option key={block.id} value={block.id}>
                                {block.title ?? `${copy.source} ${index + 1}`}
                            </option>
                        ))}
                    </select>
                    <label htmlFor={`${id}-language`}>{copy.language}</label>
                    <input
                        id={`${id}-language`}
                        className={styles.field}
                        value={state.language}
                        onChange={language}
                        maxLength={35}
                        disabled={state.busy || state.active}
                    />
                </>
            )}
            {!hasSource && state.busy && <p role='status'>{copy.busy}</p>}
            <div className={styles.actions}>
                {hasSource && (
                    <Button
                        type='button'
                        onClick={prepare}
                        disabled={state.busy || state.active}
                    >
                        {state.busy ? copy.busy : copy.prepare}
                    </Button>
                )}
                {state.active ? (
                    <Button type='button' variant='secondary' onClick={cancel}>
                        {copy.cancel}
                    </Button>
                ) : null}
                {state.failed && state.canRetry ? (
                    <Button
                        type='button'
                        variant='secondary'
                        onClick={retry}
                        disabled={state.busy}
                    >
                        {copy.retry}
                    </Button>
                ) : null}
            </div>
            {quote ? (
                <div className={styles.quote}>
                    <p>
                        {copy.maximum}:{' '}
                        <strong>{state.job?.maximumCredits}</strong>
                    </p>
                    <p>{copy.quote}</p>
                    <Button
                        type='button'
                        onClick={confirm}
                        disabled={state.busy}
                    >
                        {copy.confirm}
                    </Button>
                </div>
            ) : null}
            {state.unready ? (
                <InlineAlert tone='warning'>{copy.unready}</InlineAlert>
            ) : null}
            {(state.failed && !state.unready) || jobFailed ? (
                <InlineAlert tone='danger'>{copy.failed}</InlineAlert>
            ) : null}
            {cancelled ? <p role='status'>{copy.cancelled}</p> : null}
            {preview ? (
                <>
                    <label htmlFor={`${id}-preview`}>{copy.preview}</label>
                    <textarea
                        id={`${id}-preview`}
                        className={styles.field}
                        readOnly
                        rows={6}
                        value={preview.text}
                    />
                    <p>
                        {props.variant === 'focused'
                            ? copy.localNoSave
                            : copy.noSave}
                    </p>
                    <div>
                        <Button
                            type='button'
                            onClick={apply}
                            disabled={state.busy || state.applied}
                        >
                            {props.variant === 'focused'
                                ? copy.localApply
                                : copy.apply}
                        </Button>
                    </div>
                </>
            ) : null}
            {state.conflict ? (
                <InlineAlert tone='warning'>{copy.conflict}</InlineAlert>
            ) : null}
            {state.applied ? (
                <p role='status'>
                    {props.variant === 'focused'
                        ? copy.localApplied
                        : copy.applied}
                </p>
            ) : null}
        </section>
    );
}
