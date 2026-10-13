'use client';
import type { SpeechSource } from '@languon/contracts';
import { Volume2, Square } from 'lucide-react';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { useSpeechControl } from '../../hooks/use-speech-control';
import { speechCopy } from '../../lib/copy';
import { SpeechConfirmation } from '../speech-confirmation/speech-confirmation';
import styles from './speech-control.module.css';

export function SpeechControl({
    source,
    requestWithSession,
    fieldLabel,
}: {
    source: SpeechSource;
    requestWithSession: RequestWithSession;
    fieldLabel?: string;
}) {
    const { locale, t } = useI18n();
    const copy = speechCopy[locale];
    const c = useSpeechControl(source, requestWithSession);
    if (!c.available) return null;
    const phase = c.selected ? c.state.phase : 'idle';
    const loading = phase === 'loading';
    const playing = phase === 'playing';
    const label = playing ? copy.stop : copy.play;
    const accessibleLabel = fieldLabel
        ? t(
              playing
                  ? 'dictionary.audio.stopField'
                  : 'dictionary.audio.playField',
              { field: fieldLabel },
          )
        : label;
    const icon = playing ? (
        <Square aria-hidden className={styles.icon} />
    ) : (
        <Volume2 aria-hidden className={styles.icon} />
    );
    let status = '';
    if (loading) status = copy.loading;
    else if (phase === 'ready') status = copy.ready;
    else if (phase === 'failed') status = copy.failed;
    else if (phase === 'unavailable') status = copy.unavailable;
    else if (c.selected && c.state.fixture) status = copy.fixture;
    const handler = playing ? c.stop : c.play;
    return (
        <span className={styles.control} dir='ltr' lang={locale}>
            <Button
                type='button'
                variant='ghost'
                size='compact'
                aria-label={accessibleLabel}
                loading={loading}
                leadingIcon={icon}
                onClick={handler}
            >
                {label}
            </Button>
            {loading ? (
                <Button
                    type='button'
                    variant='ghost'
                    size='compact'
                    onClick={c.stop}
                >
                    {copy.stopWaiting}
                </Button>
            ) : null}
            <span role='status' aria-live='polite' className={styles.status}>
                {status}
            </span>
            {c.selected && c.state.quote ? (
                <SpeechConfirmation
                    key={c.state.quote.id}
                    quote={c.state.quote}
                    onConfirm={c.confirm}
                    onCancel={c.stop}
                />
            ) : null}
        </span>
    );
}
