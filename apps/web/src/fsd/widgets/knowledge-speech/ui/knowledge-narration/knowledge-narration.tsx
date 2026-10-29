'use client';
import { useId, useEffect, useRef, type ChangeEvent } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { SpeechConfirmation } from '@/fsd/features/speech-playback';
import { useKnowledgeNarration } from '../../hooks/use-knowledge-narration';
import { narrationCopy } from '../../lib/copy';
import type { KnowledgeNarrationProps } from '../../types';
import type { LearningBlock } from '@languon/contracts';
import styles from './knowledge-narration.module.css';

function SourceOption({
    block,
    index,
    label,
}: {
    block: LearningBlock;
    index: number;
    label: string;
}) {
    const title = block.title || `${label} ${index + 1}`;
    return <option value={block.id}>{title}</option>;
}

export function KnowledgeNarration(props: KnowledgeNarrationProps) {
    const { locale } = useI18n(),
        copy = narrationCopy[locale];
    const id = useId(),
        state = useKnowledgeNarration(props);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    useEffect(() => {
        const audio = audioRef.current;
        return () => {
            audio?.pause();
            audio?.removeAttribute('src');
            audio?.load();
        };
    }, [state.url]);
    const blocks = props.blocks.filter((block) =>
        ['bilingual-text', 'grammar', 'vocabulary'].includes(block.type),
    );
    const selected = blocks.some((block) => block.id === state.selected)
        ? state.selected
        : blocks[0]?.id || '';
    const canApply = Boolean(state.url) && !state.busy && !state.applied;
    const quote =
        state.response?.state === 'confirmation_required'
            ? state.response.quote
            : null;
    const unavailable = [
        'unavailable',
        'failed',
        'submission_unknown',
    ].includes(state.response?.state ?? '');
    const hasSource = blocks.length > 0;
    const hasActivity =
        state.busy ||
        state.response !== null ||
        state.url !== null ||
        state.failed;
    function change(event: ChangeEvent<HTMLSelectElement>) {
        state.setSelected(event.target.value);
    }
    function generate() {
        void state.generate();
    }
    function confirm() {
        void state.confirm();
    }
    function apply() {
        void state.apply();
    }
    if (!hasSource && !hasActivity)
        return props.hideWhenEmpty ? null : <p>{copy.empty}</p>;
    return (
        <section className={styles.root} aria-label={copy.title}>
            <h3>{copy.title}</h3>
            {hasSource && (
                <>
                    <label htmlFor={id}>{copy.source}</label>
                    <select
                        className={styles.sourceSelect}
                        id={id}
                        value={selected}
                        onChange={change}
                        disabled={state.busy}
                    >
                        {blocks.map((block, index) => (
                            <SourceOption
                                key={block.id}
                                block={block}
                                index={index}
                                label={copy.source}
                            />
                        ))}
                    </select>
                    <Button onClick={generate} disabled={state.busy}>
                        {state.busy ? copy.busy : copy.generate}
                    </Button>
                </>
            )}
            {!hasSource && state.busy && <p role='status'>{copy.busy}</p>}
            {state.url ? (
                <audio
                    ref={audioRef}
                    className={styles.audio}
                    controls
                    src={state.url}
                />
            ) : null}
            {state.response?.fixture ? (
                <InlineAlert tone='info'>{copy.fixture}</InlineAlert>
            ) : null}
            {state.failed ? (
                <InlineAlert tone='danger'>{copy.failed}</InlineAlert>
            ) : null}
            {unavailable ? (
                <InlineAlert tone='warning'>{copy.noResult}</InlineAlert>
            ) : null}
            {state.url ? (
                <Button onClick={apply} disabled={!canApply}>
                    {copy.apply}
                </Button>
            ) : null}
            {state.applied ? <p role='status'>{copy.applied}</p> : null}
            {quote ? (
                <SpeechConfirmation
                    quote={quote}
                    onConfirm={confirm}
                    onCancel={state.cancelQuote}
                />
            ) : null}
        </section>
    );
}
