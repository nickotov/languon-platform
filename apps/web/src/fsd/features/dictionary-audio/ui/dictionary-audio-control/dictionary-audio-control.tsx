import { LoaderCircle, Square, Volume2 } from 'lucide-react';
import type { DictionaryAudioField, DictionaryCard } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton } from '@/fsd/shared/ui';
import type { useDictionaryAudio } from '../../hooks/use-dictionary-audio';
import styles from './dictionary-audio-control.module.css';

export function DictionaryAudioControl({
    card,
    field,
    playback,
}: {
    card: DictionaryCard;
    field: DictionaryAudioField;
    playback: ReturnType<typeof useDictionaryAudio>;
}) {
    const { locale, t } = useI18n();
    const selected =
        playback.state.selection?.card.id === card.id &&
        playback.state.selection.field === field;
    const phase = selected ? playback.state.phase : 'idle';
    const busy = phase === 'loading' || phase === 'playing';
    const label = t(`dictionary.field.${field}`);
    return (
        <span className={styles.control} dir='ltr' lang={locale}>
            <IconButton
                type='button'
                label={t(
                    busy
                        ? 'dictionary.audio.stopField'
                        : 'dictionary.audio.playField',
                    { field: label },
                )}
                onClick={() =>
                    busy ? playback.stop() : void playback.play({ card, field })
                }
            >
                {phase === 'loading' ? (
                    <LoaderCircle size={15} aria-hidden='true' />
                ) : busy ? (
                    <Square size={15} aria-hidden='true' />
                ) : (
                    <Volume2 size={15} aria-hidden='true' />
                )}
            </IconButton>
            {selected ? (
                <>
                    <span role='status' className={styles.status}>
                        {phase !== 'idle' ? t(`dictionary.audio.${phase}`) : ''}
                        {playback.state.fixture
                            ? ` ${t('dictionary.audio.fixture')}`
                            : ''}
                    </span>
                </>
            ) : null}
        </span>
    );
}
